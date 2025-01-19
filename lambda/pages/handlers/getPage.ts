import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPageById } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { getEnvVars } from '../../utils/env';

const env = getEnvVars();

export async function getPage(id: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const page = await getPageById(env.TABLE_NAME, id);

    if (!page) {
        return createErrorResponse(404, 'Page not found', event.requestContext.requestId);
    }

    return createResponse(200, page, event.requestContext.requestId);
}