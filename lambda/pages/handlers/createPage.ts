import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPageById, createPage as createNewPage } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { validatePage } from '../../utils/validation';
import { getEnvVars } from '../../utils/env';

const env = getEnvVars();

export async function createPage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
        // Parse and validate request body
        const body = JSON.parse(event.body || '{}');

        // Validate required fields
        if (!body.id) {
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

        // Validate page data
        const validationErrors = validatePage(body);
        if (validationErrors.length > 0) {
            return createErrorResponse(
                400,
                'Validation failed',
                event.requestContext.requestId,
                { errors: validationErrors }
            );
        }

        // Create the page
        const newPage = await createNewPage(env.TABLE_NAME, body);

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