import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { createResponse, createErrorResponse } from '../../utils/response';
import { EntityType, KeyPrefix, Node } from '../../types/common';
import { validateNode } from '../../utils/validation';
import { getEnvVars } from '../../utils/env';

const docClient = createDynamoDBClient();
const env = getEnvVars();

export async function createNode(pageId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Creating node for page:', JSON.stringify({
        pageId,
        requestId: event.requestContext.requestId
    }, null, 2));

    try {
        // Check if page exists
        const pageResult = await docClient.send(new GetCommand({
            TableName: env.TABLE_NAME,
            Key: {
                PK: `${KeyPrefix.PAGE}${pageId}`,
                SK: KeyPrefix.META
            }
        }));

        if (!pageResult.Item) {
            console.log('Page not found:', pageId);
            return createErrorResponse(404, 'Page not found', event.requestContext.requestId);
        }

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

        const timestamp = new Date().toISOString();
        const node: Node = {
            ...body,
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: `${KeyPrefix.NODE}${body.id}`,
            pageId,
            createdAt: timestamp,
            updatedAt: timestamp,
            type: EntityType.NODE
        };

        await docClient.send(new PutCommand({
            TableName: env.TABLE_NAME,
            Item: node
        }));

        console.log('Node created successfully:', JSON.stringify({
            nodeId: node.id,
            pageId
        }, null, 2));

        return createResponse(201, node, event.requestContext.requestId);
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