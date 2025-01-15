import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EntityType, HttpMethod, KeyPrefix, Page } from '../types/common';

const dynamodb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamodb);
const TABLE_NAME = process.env.TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    switch (event.httpMethod) {
      case HttpMethod.GET:
        if (event.pathParameters?.id) {
          return await getPage(event.pathParameters.id);
        }
        return await getPages();

      case HttpMethod.POST:
        return await createPage(event);

      case HttpMethod.PUT:
        if (!event.pathParameters?.id) {
          throw new Error('Missing page ID');
        }
        return await updatePage(event.pathParameters.id, event);

      case HttpMethod.DELETE:
        if (!event.pathParameters?.id) {
          throw new Error('Missing page ID');
        }
        return await deletePage(event.pathParameters.id);

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Unsupported method' })
        };
    }
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
}

async function getPage(id: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `${KeyPrefix.PAGE}${id}`,
      SK: KeyPrefix.META
    }
  }));

  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Page not found' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(result.Item || {})
  };
}

async function getPages(): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': KeyPrefix.PAGE,
      ':sk': KeyPrefix.META
    }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items || [])
  };
}

async function createPage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const page: Page = {
    PK: `${KeyPrefix.PAGE}${body.id}`,
    SK: KeyPrefix.META,
    isPublished: body.isPublished ? 1 : 0,  // Convert boolean to number
    title: body.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: EntityType.PAGE
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: page
  }));

  return {
    statusCode: 201,
    body: JSON.stringify(page)
  };
}

async function updatePage(id: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `${KeyPrefix.PAGE}${id}`,
      SK: KeyPrefix.META
    },
    UpdateExpression: 'set updatedAt = :timestamp, title = :title, isPublished = :isPublished',
    ExpressionAttributeValues: {
      ':timestamp': timestamp,
      ':title': body.title,
      ':isPublished': body.isPublished ? 1 : 0
    },
    ReturnValues: 'ALL_NEW'
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result.Attributes || {})
  };
}

async function deletePage(id: string): Promise<APIGatewayProxyResult> {
  // First, get all nodes for this page
  const nodesResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `${KeyPrefix.PAGE}${id}`,
      ':sk': KeyPrefix.NODE
    }
  }));

  // If there are nodes, delete them in batches
  if (nodesResult.Items && nodesResult.Items.length > 0) {
    // DynamoDB BatchWrite can only handle 25 items at a time
    for (let i = 0; i < nodesResult.Items.length; i += 25) {
      const batch = nodesResult.Items.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map(item => ({
            DeleteRequest: {
              Key: {
                PK: item.PK,
                SK: item.SK
              }
            }
          }))
        }
      }));
    }
  }

  // Finally, delete the page itself
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `${KeyPrefix.PAGE}${id}`,
      SK: KeyPrefix.META
    }
  }));

  return {
    statusCode: 204,
    body: ''
  };
}