import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { createResponse } from '../../utils/response';
import { KeyPrefix } from '../../types/common';
import { getEnvVars } from '../../utils/env';

const docClient = createDynamoDBClient();
const env = getEnvVars();

export async function getNodes(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Getting nodes for page:', JSON.stringify({
        pageId,
        requestId: event.requestContext.requestId
    }, null, 2));

    const result = await docClient.send(new QueryCommand({
        TableName: env.TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `${KeyPrefix.PAGE}${pageId}`,
            ':sk': KeyPrefix.NODE
        }
    }));

    console.log('Query result:', JSON.stringify({
        itemCount: result.Items?.length || 0,
        scannedCount: result.ScannedCount
    }, null, 2));

    return createResponse(
        200,
        result.Items || [],
        event.requestContext.requestId,
        { count: result.Items?.length || 0 }
    );
}