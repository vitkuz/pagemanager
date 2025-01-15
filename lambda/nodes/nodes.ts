import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EntityType, HttpMethod, KeyPrefix, Node } from '../types/common';
import { DEFAULT_HEADERS } from '../utils/headers';

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
      case HttpMethod.GET:
        return await getNodes(pageId, event);

      case HttpMethod.POST:
        return await createNode(pageId, event);

      case HttpMethod.DELETE:
        const nodeId = event.pathParameters?.nodeId;
        if (!nodeId) {
          throw new Error('Missing node ID');
        }
        return await deleteNode(pageId, nodeId, event);

      default:
        return {
          statusCode: 400,
          headers: DEFAULT_HEADERS(event.requestContext.requestId),
          body: JSON.stringify({ message: 'Unsupported method' })
        };
    }
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS(event.requestContext.requestId),
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
}

async function getNodes(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `${KeyPrefix.PAGE}${pageId}`,
      ':sk': KeyPrefix.NODE
    }
  }));

  return {
    statusCode: 200,
    headers: DEFAULT_HEADERS(event.requestContext.requestId),
    body: JSON.stringify(result.Items || [])
  };
}

async function createNode(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Check if page exists
  const pageResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `${KeyPrefix.PAGE}${pageId}`,
      SK: KeyPrefix.META
    }
  }));

  if (!pageResult.Item) {
    return {
      statusCode: 404,
      headers: DEFAULT_HEADERS(event.requestContext.requestId),
      body: JSON.stringify({ message: 'Page not found' })
    };
  }

  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const node: Node = {
    PK: `${KeyPrefix.PAGE}${pageId}`,
    SK: `${KeyPrefix.NODE}${body.id}`,
    title: body.title,
    description: body.description,
    prompt: body.prompt,
    generatedImages: body.generatedImages,
    predictionId: body.predictionId,
    predictionStatus: body.predictionStatus,
    pageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: EntityType.NODE
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: node
  }));

  return {
    statusCode: 201,
    headers: DEFAULT_HEADERS(event.requestContext.requestId),
    body: JSON.stringify(node)
  };
}

async function deleteNode(pageId: string, nodeId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `${KeyPrefix.PAGE}${pageId}`,
      SK: `${KeyPrefix.NODE}${nodeId}`
    }
  }));

  return {
    statusCode: 204,
    headers: DEFAULT_HEADERS(event.requestContext.requestId),
    body: ''
  };
}