// connect.ts
import {
    DynamoDBClient, PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const dbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME as string;
const API_GATEWAY_ENDPOINT = process.env.API_GATEWAY_ENDPOINT as string;


// Helper function to store connection ID in DynamoDB
const storeConnectionId = async (connectionId: string): Promise<void> => {
    await dbClient.send(
        new PutItemCommand({
            TableName: TABLE_NAME,
            Item: { connectionId: { S: connectionId } },
        })
    );
};

// Send a message to the connected client
const sendMessageToClient = async (connectionId: string, message: string): Promise<void> => {
    const apigwClient = new ApiGatewayManagementApiClient({ endpoint: API_GATEWAY_ENDPOINT });

    try {
        await apigwClient.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(message),
        }));
    } catch (error) {
        console.error(`Error sending message to connection ${connectionId}:`, error);
    }
};



export const handler: APIGatewayProxyHandler = async (event) => {
    const connectionId = event.requestContext.connectionId as string;
    const welcomeMessage = "Hello from server";

    try {
        await storeConnectionId(connectionId);

        // Send welcome message to the connected client
        await sendMessageToClient(connectionId, welcomeMessage);

        return { statusCode: 200, body: 'Connected' };
    } catch (error) {
        console.error('Connection error:', error);
        return { statusCode: 500, body: 'Failed to connect' };
    }
};
