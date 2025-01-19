import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HttpMethod } from '../types/common';
import { createErrorResponse } from '../utils/response';
import { getNodes } from './handlers/getNodes';
import { createNode } from './handlers/createNode';
import { deleteNode } from './handlers/deleteNode';
import { updateNode } from './handlers/updateNode';
import {DEFAULT_HEADERS} from "../utils/headers";

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Nodes Lambda invoked:', JSON.stringify({
    requestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  }, null, 2));

  try {
    const pageId = event.pathParameters?.id;
    if (!pageId) {
      console.log('Missing page ID in request');
      throw new Error('Missing page ID');
    }

    switch (event.httpMethod) {
      case HttpMethod.GET:
        console.log('Getting nodes for page:', pageId);
        return await getNodes(pageId, event);

      case HttpMethod.POST:
        console.log('Creating new node for page:', pageId);
        return await createNode(pageId, event);

      case HttpMethod.DELETE:
        const nodeId = event.pathParameters?.nodeId;
        if (!nodeId) {
          console.log('Missing node ID for delete operation');
          throw new Error('Missing node ID');
        }
        console.log('Deleting node:', JSON.stringify({ pageId, nodeId }, null, 2));
        return await deleteNode(pageId, nodeId, event);

      case HttpMethod.PUT:
        const updateNodeId = event.pathParameters?.nodeId;
        if (!updateNodeId) {
          console.log('Missing node ID for update operation');
          throw new Error('Missing node ID');
        }
        console.log('Updating node:', JSON.stringify({ pageId, nodeId: updateNodeId }, null, 2));
        return await updateNode(pageId, updateNodeId, event);

      default:
        console.log('Unsupported HTTP method:', event.httpMethod);
        return createErrorResponse(400, 'Unsupported method', event.requestContext.requestId);
    }
  } catch (error) {
    console.error('Error in Nodes Lambda:', JSON.stringify({
      error,
      path: event.path,
      method: event.httpMethod,
      pageId: event.pathParameters?.id,
      nodeId: event.pathParameters?.nodeId
    }, null, 2));
    return createErrorResponse(500, 'Internal server error', event.requestContext.requestId);
  } finally {
    console.log('Nodes Lambda execution completed');
  }
}