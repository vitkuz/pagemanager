import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HttpMethod } from '../types/common';
import { createErrorResponse } from '../utils/response';
import { getPage } from './handlers/getPage';
import { getPages } from './handlers/getPages';
import { createPage } from './handlers/createPage';
import { updatePage } from './handlers/updatePage';
import { deletePage } from './handlers/deletePage';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Pages Lambda invoked:', JSON.stringify({
    requestId: event.requestContext.requestId,
    path: event.path,
    httpMethod: event.httpMethod,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  }, null, 2));

  try {
    switch (event.httpMethod) {
      case HttpMethod.GET:
        if (event.pathParameters?.id) {
          console.log('Getting single page:', event.pathParameters.id);
          return await getPage(event.pathParameters.id, event);
        }
        console.log('Getting all pages');
        return await getPages(event);

      case HttpMethod.POST:
        console.log('Creating new page');
        return await createPage(event);

      case HttpMethod.PUT:
        if (!event.pathParameters?.id) {
          console.log('Missing page ID for update');
          return createErrorResponse(400, 'Missing page ID', event.requestContext.requestId);
        }
        console.log('Updating page:', event.pathParameters.id);
        return await updatePage(event.pathParameters.id, event);

      case HttpMethod.DELETE:
        if (!event.pathParameters?.id) {
          console.log('Missing page ID for delete');
          throw new Error('Missing page ID');
        }
        console.log('Deleting page:', event.pathParameters.id);
        return await deletePage(event.pathParameters.id, event);

      default:
        console.log('Unsupported HTTP method:', event.httpMethod);
        return createErrorResponse(400, 'Unsupported method', event.requestContext.requestId);
    }
  } catch (error) {
    console.error('Error in Pages Lambda:', JSON.stringify({
      error,
      path: event.path,
      method: event.httpMethod
    }, null, 2));
    return createErrorResponse(500, 'Internal server error', event.requestContext.requestId);
  } finally {
    console.log('Pages Lambda execution completed');
  }
}