import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HttpMethod } from '../types/common';
import { createErrorResponse } from '../utils/response';
import { getPage } from './handlers/getPage';
import { getPages } from './handlers/getPages';
import { createPage } from './handlers/createPage';
import { updatePage } from './handlers/updatePage';
import { deletePage } from './handlers/deletePage';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    switch (event.httpMethod) {
      case HttpMethod.GET:
        if (event.pathParameters?.id) {
          return await getPage(event.pathParameters.id, event);
        }
        return await getPages(event);

      case HttpMethod.POST:
        return await createPage(event);

      case HttpMethod.PUT:
        if (!event.pathParameters?.id) {
          return createErrorResponse(400, 'Missing page ID', event.requestContext.requestId);
        }
        return await updatePage(event.pathParameters.id, event);

      case HttpMethod.DELETE:
        if (!event.pathParameters?.id) {
          throw new Error('Missing page ID');
        }
        return await deletePage(event.pathParameters.id, event);

      default:
        return createErrorResponse(400, 'Unsupported method', event.requestContext.requestId);
    }
  } catch (error) {
    console.error(error);
    return createErrorResponse(500, 'Internal server error', event.requestContext.requestId);
  }
}