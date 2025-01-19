import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPageById, updatePageById } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { validatePage } from '../../utils/validation';
import { getEnvVars } from '../../utils/env';

const env = getEnvVars();

export async function updatePage(id: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
        // Check if page exists
        const existingPage = await getPageById(env.TABLE_NAME, id);
        if (!existingPage) {
            return createErrorResponse(404, 'Page not found', event.requestContext.requestId);
        }

        // Parse and validate request body
        const updates = JSON.parse(event.body || '{}');
        const validationErrors = validatePage(updates);
        if (validationErrors.length > 0) {
            return createErrorResponse(
                400,
                'Validation failed',
                event.requestContext.requestId,
                { errors: validationErrors }
            );
        }

        // Update the page
        const updatedPage = await updatePageById(env.TABLE_NAME, id, updates);
        if (!updatedPage) {
            return createErrorResponse(
                500,
                'Failed to update page',
                event.requestContext.requestId
            );
        }

        return createResponse(200, updatedPage, event.requestContext.requestId);
    } catch (error) {
        if (error instanceof SyntaxError) {
            return createErrorResponse(
                400,
                'Invalid request body',
                event.requestContext.requestId
            );
        }
        throw error;
    }
}