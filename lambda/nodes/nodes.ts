import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamodb);
const TABLE_NAME = process.env.TABLE_NAME!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const pageId = event.pathParameters?.id;
    if (!pageId) {
      throw new Error('Missing page ID');
    }

    switch (event.httpMethod) {
      case 'GET':
        return await getNodes(pageId);

      case 'POST':
        return await createNode(pageId, event);

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

async function getNodes(pageId: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `PAGE#${pageId}`,
      ':sk': 'NODE#'
    }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items)
  };
}

async function createNode(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const node = {
    PK: `PAGE#${pageId}`,
    SK: `NODE#${body.id}`,
    ...body,
    pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: 'node'
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: node
  }));

  return {
    statusCode: 201,
    body: JSON.stringify(node)
  };
}