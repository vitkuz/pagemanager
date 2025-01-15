import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamodb);
const TABLE_NAME = process.env.TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    switch (event.httpMethod) {
      case 'GET':
        if (event.pathParameters?.id) {
          return await getPage(event.pathParameters.id);
        }
        return await getPages();

      case 'POST':
        return await createPage(event);

      case 'PUT':
        if (!event.pathParameters?.id) {
          throw new Error('Missing page ID');
        }
        return await updatePage(event.pathParameters.id, event);

      case 'DELETE':
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
      PK: `PAGE#${id}`,
      SK: 'META#'
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
    body: JSON.stringify(result.Item)
  };
}

async function getPages(): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'begins_with(PK, :pk) AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': 'PAGE#',
      ':sk': 'META#'
    }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items)
  };
}

async function createPage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const page = {
    PK: `PAGE#${body.id}`,
    SK: 'META#',
    ...body,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: 'page'
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
      PK: `PAGE#${id}`,
      SK: 'META#'
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
    body: JSON.stringify(result.Attributes)
  };
}

async function deletePage(id: string): Promise<APIGatewayProxyResult> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `PAGE#${id}`,
      SK: 'META#'
    }
  }));

  return {
    statusCode: 204,
    body: ''
  };
}