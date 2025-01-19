import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EntityType, HttpMethod, KeyPrefix, Node } from '../types/common';
import { getEnvVars } from '../utils/env';
import { queryNodes, getPage, createNode as createDynamoNode, deleteNode as deleteDynamoNode } from '../utils/dynamodb';
import { createResponse, createErrorResponse } from '../utils/response';

const env = getEnvVars();

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log(JSON.stringify(event, null ,2));
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

      case HttpMethod.PUT:
        const updateNodeId = event.pathParameters?.nodeId;
        if (!updateNodeId) {
          throw new Error('Missing node ID');
        }
        return await updateNode(pageId, updateNodeId, event);

      default:
        return createErrorResponse(400, 'Unsupported method', event.requestContext.requestId);
    }
  } catch (error) {
    console.error(error);
    return createErrorResponse(500, 'Internal server error', event.requestContext.requestId);
  }
}

async function getNodes(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const nodes = await queryNodes(env.TABLE_NAME, pageId);
  return createResponse(200, nodes, event.requestContext.requestId);
}

async function createNode(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Check if page exists
  const pageResult = await getPage(env.TABLE_NAME, pageId);

  if (!pageResult) {
    return createErrorResponse(404, 'Page not found', event.requestContext.requestId);
  }

  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  const node: Node = {
    ...body,
    PK: `${KeyPrefix.PAGE}${pageId}`,
    SK: `${KeyPrefix.NODE}${body.id}`,
    pageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: EntityType.NODE
  };

  await createDynamoNode(env.TABLE_NAME, node);

  return createResponse(201, node, event.requestContext.requestId);
}

async function deleteNode(pageId: string, nodeId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  await deleteDynamoNode(env.TABLE_NAME, pageId, nodeId);

  return createResponse(204, '', event.requestContext.requestId);
}

async function updateNode(pageId: string, nodeId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const timestamp = new Date().toISOString();

  // Start with updatedAt which is always required
  let updateExpression = 'set #updatedAt = :timestamp';
  const expressionAttributeValues: Record<string, any> = {
    ':timestamp': timestamp,
  };
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt', // Handle reserved keyword
  };

  // Add all fields from body except protected ones
  const protectedFields = ['PK', 'SK', 'createdAt', 'type', 'pageId', 'updatedAt'];
  Object.entries(body).forEach(([key, value]) => {
    if (!protectedFields.includes(key)) {
      const placeholder = key === 'time' ? '#time' : `#${key}`;
      updateExpression += `, ${placeholder} = :${key}`;
      expressionAttributeNames[placeholder] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  // Check if node exists
  const nodeResult = await getPage(env.TABLE_NAME, pageId);

  if (!nodeResult) {
    return createErrorResponse(404, 'Node not found', event.requestContext.requestId);
  }

  const result = await createDynamoNode(env.TABLE_NAME, {
    PK: `${KeyPrefix.PAGE}${pageId}`,
    SK: `${KeyPrefix.NODE}${nodeId}`,
    ...body,
    updatedAt: timestamp
  });

  return createResponse(200, result, event.requestContext.requestId);
}