import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPageById, deletePage as deletePageFromDb } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { getEnvVars } from '../../utils/env';

const env = getEnvVars();

export async function deletePage(id: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
        // Check if page exists
        const existingPage = await getPageById(env.TABLE_NAME, id);
        if (!existingPage) {
            return createErrorResponse(
                404,
                'Page not found',
                event.requestContext.requestId
            );
        }

        // Delete the page and all its nodes
        await deletePageFromDb(env.TABLE_NAME, id);

        return createResponse(
            204,
            null,
            event.requestContext.requestId,
            { message: 'Page and associated nodes deleted successfully' }
        );
    } catch (error) {
        console.error('Error deleting page:', error);
        throw error;
    }
}