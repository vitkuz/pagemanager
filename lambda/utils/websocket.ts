import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { getEnvVars } from './env';

const dynamoClient = new DynamoDBClient({});
const env = getEnvVars();

export const sendMessageToConnections = async (message: any) => {
    const apiClient = new ApiGatewayManagementApiClient({
        endpoint: env.WEBSOCKET_API_URL
    });

    const connectionsData = await dynamoClient.send(
        new ScanCommand({ TableName: env.CONNECTIONS_TABLE_NAME })
    );

    const connections = connectionsData.Items || [];

    await Promise.all(connections.map(async (connection) => {
        const connectionId = connection.connectionId.S;
        if (!connectionId) return;

        try {
            await apiClient.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify(message),
            }));
        } catch (error: any) {
            if (error.name === "GoneException") {
                await dynamoClient.send(
                    new DeleteItemCommand({
                        TableName: env.CONNECTIONS_TABLE_NAME,
                        Key: { connectionId: { S: connectionId } },
                    })
                );
            }
        }
    }));
};