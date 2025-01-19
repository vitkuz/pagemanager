import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { KeyPrefix } from '../../types/common';
import { getEnvVars } from '../../utils/env';

const docClient = createDynamoDBClient();
const env = getEnvVars();

export async function deleteNode(
    pageId: string,
    nodeId: string,
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    console.log('Deleting node:', JSON.stringify({
        pageId,
        nodeId,
        requestId: event.requestContext.requestId
    }, null, 2));

    // Check if node exists
    const nodeResult = await docClient.send(new GetCommand({
        TableName: env.TABLE_NAME,
        Key: {
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: `${KeyPrefix.NODE}${nodeId}`
        }
    }));

    if (!nodeResult.Item) {
        console.log('Node not found:', JSON.stringify({ pageId, nodeId }, null, 2));
        return createErrorResponse(404, 'Node not found', event.requestContext.requestId);
    }

    await docClient.send(new DeleteCommand({
        TableName: env.TABLE_NAME,
        Key: {
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: `${KeyPrefix.NODE}${nodeId}`
        }
    }));

    console.log('Node deleted successfully:', JSON.stringify({ pageId, nodeId }, null, 2));

    return createResponse(204, null, event.requestContext.requestId);
}