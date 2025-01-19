import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllPages } from '../../utils/dynamodb';
import { createResponse } from '../../utils/response';
import { getEnvVars } from '../../utils/env';

const env = getEnvVars();

export async function getPages(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const pages = await getAllPages(env.TABLE_NAME);

    return createResponse(
        200,
        pages,
        event.requestContext.requestId,
        { count: pages.length }
    );
}