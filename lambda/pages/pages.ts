import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EntityType, HttpMethod, KeyPrefix, Page } from '../types/common';
import { getEnvVars } from '../utils/env';
import { getPageById, getAllPages, createNewPage } from '../utils/dynamodb';
import { createResponse, createErrorResponse } from '../utils/response';
import { validatePage } from '../utils/validation';

const env = getEnvVars();

const createPageData = (body: any): Page => {
  const timestamp = new Date().toISOString();
  return {
    ...body,
    PK: `${KeyPrefix.PAGE}${body.id}`,
    SK: KeyPrefix.META,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: EntityType.PAGE,
    isPublished: body.isPublished ? 1 : 0
  };
};

async function createPage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    const validationErrors = validatePage(body);
    if (validationErrors.length > 0) {
      return createErrorResponse(
          400,
          'Validation failed',
          event.requestContext.requestId,
          { errors: validationErrors }
      );
    }

    // Check if ID is provided
    if (!body.id?.trim()) {
      return createErrorResponse(
          400,
          'Page ID is required',
          event.requestContext.requestId
      );
    }

    // Check if page with this ID already exists
    const existingPage = await getPageById(env.TABLE_NAME, body.id);
    if (existingPage) {
      return createErrorResponse(
          409,
          'Page with this ID already exists',
          event.requestContext.requestId
      );
    }

    const pageData = createPageData(body);
    const newPage = await createNewPage(env.TABLE_NAME, pageData);

    return createResponse(
        201,
        newPage,
        event.requestContext.requestId,
        { message: 'Page created successfully' }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(
          400,
          'Invalid JSON in request body',
          event.requestContext.requestId
      );
    }
    throw error;
  }
}

async function getPage(id: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const page = await getPageById(env.TABLE_NAME, id);

  if (!page) {
    return createErrorResponse(404, 'Page not found', event.requestContext.requestId);
  }

  return createResponse(200, page, event.requestContext.requestId);
}

async function getPages(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pages = await getAllPages(env.TABLE_NAME);

  return createResponse(
      200,
      pages,
      event.requestContext.requestId,
      { count: pages.length }
  );
}

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
          throw new Error('Missing page ID');
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