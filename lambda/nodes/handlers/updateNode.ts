import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { KeyPrefix } from '../../types/common';
import { validateNode } from '../../utils/validation';
import { getEnvVars } from '../../utils/env';

const docClient = createDynamoDBClient();
const env = getEnvVars();

export async function updateNode(
    pageId: string,
    nodeId: string,
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    console.log('Updating node:', JSON.stringify({
        pageId,
        nodeId,
        requestId: event.requestContext.requestId
    }, null, 2));

    try {
        const body = JSON.parse(event.body || '{}');
        console.log('Request body:', JSON.stringify(body, null, 2));

        // Validate node data
        const validationErrors = validateNode(body);
        if (validationErrors.length > 0) {
            console.log('Validation errors:', JSON.stringify(validationErrors, null, 2));
            return createErrorResponse(
                400,
                'Validation failed',
                event.requestContext.requestId,
                { errors: validationErrors }
            );
        }

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

        const timestamp = new Date().toISOString();
        let updateExpression = 'set updatedAt = :timestamp';
        const expressionAttributeValues: Record<string, any> = {
            ':timestamp': timestamp
        };
        const expressionAttributeNames: Record<string, string> = {
            '#updatedAt': 'updatedAt'
        };

        // Add all fields from body except protected ones
        const protectedFields = ['PK', 'SK', 'createdAt', 'type', 'pageId'];
        Object.entries(body).forEach(([key, value]) => {
            if (!protectedFields.includes(key)) {
                const placeholder = `#${key}`;
                updateExpression += `, ${placeholder} = :${key}`;
                expressionAttributeNames[placeholder] = key;
                expressionAttributeValues[`:${key}`] = value;
            }
        });

        console.log('Update expression:', JSON.stringify({
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues
        }, null, 2));

        const result = await docClient.send(new UpdateCommand({
            TableName: env.TABLE_NAME,
            Key: {
                PK: `${KeyPrefix.PAGE}${pageId}`,
                SK: `${KeyPrefix.NODE}${nodeId}`
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }));

        console.log('Node updated successfully:', JSON.stringify({
            nodeId,
            pageId,
            updatedFields: Object.keys(body)
        }, null, 2));

        return createResponse(200, result.Attributes || {}, event.requestContext.requestId);
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.log('Invalid JSON in request body');
            return createErrorResponse(
                400,
                'Invalid JSON in request body',
                event.requestContext.requestId
            );
        }
        throw error;
    }
}