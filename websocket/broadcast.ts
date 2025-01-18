// broadcast.ts
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME as string;
const API_GATEWAY_ENDPOINT = process.env.API_GATEWAY_ENDPOINT as string;

// Helper function to get all active connections from DynamoDB
const getConnectionIds = async (): Promise<string[]> => {
    console.log("Fetching active connection IDs from DynamoDB");
    const result = await dbClient.send(new ScanCommand({ TableName: TABLE_NAME }));

    if (result.Items) {
        console.log(`Found ${result.Items.length} connections`);
        return result.Items.map((item) => item.connectionId.S as string);
    } else {
        console.log("No active connections found");
        return [];
    }
};

// Helper function to send a message to a specific connection
const sendMessage = async (connectionId: string, message: string): Promise<void> => {
    const apigwClient = new ApiGatewayManagementApiClient({ endpoint: API_GATEWAY_ENDPOINT });
    console.log(`Sending message to connection ID: ${connectionId}`);

    try {
        await apigwClient.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(message),
        }));
        console.log(`Message sent to connection ID: ${connectionId}`);
    } catch (error) {
        if ((error as any).statusCode === 410) {
            console.log(`Stale connection detected, deleting connection ID: ${connectionId}`);
            await dbClient.send(new DeleteItemCommand({
                TableName: TABLE_NAME,
                Key: { connectionId: { S: connectionId } },
            }));
            console.log(`Deleted stale connection ID: ${connectionId}`);
        } else {
            console.error(`Error sending message to connection ID ${connectionId}:`, error);
        }
    }
};

// Lambda handler to broadcast a message
export const handler: APIGatewayProxyHandler = async (event) => {
    console.log("event", event);
    const body = JSON.parse(event.body || '{}');
    // const connectionId = event.requestContext.connectionId;
    const action = body.action || "action"; // Default message if none is provided
    const message = body.data || "data"; // Default message if none is provided

    console.log("body", body)
    console.log("message", message)

    console.log("Broadcasting message to all clients");

    try {
        // Get all active connection IDs
        const connectionIds = await getConnectionIds();

        // Check if there are any connections to send the message to
        if (connectionIds.length === 0) {
            console.log("No connections available to broadcast");
            return { statusCode: 200, body: 'No clients connected to broadcast' };
        }

        // Send the message to each connected client
        console.log(`Broadcasting message to ${connectionIds.length} clients`);
        await Promise.all(connectionIds.map((id) => sendMessage(id, JSON.stringify({action, message}))));

        console.log("Broadcast message successfully sent to all clients");
        return { statusCode: 200, body: 'Message broadcasted to all clients' };
    } catch (error) {
        console.error('Broadcast error:', error);
        return { statusCode: 500, body: 'Failed to broadcast message' };
    }
};
