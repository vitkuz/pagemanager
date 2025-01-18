import {
    DynamoDBClient, DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME as string;

export const handler: APIGatewayProxyHandler = async (event) => {
    const connectionId = event.requestContext.connectionId as string;

    try {
        await dbClient.send(new DeleteItemCommand({
            TableName: TABLE_NAME,
            Key: { connectionId: { S: connectionId } },
        }));
        return { statusCode: 200, body: 'Disconnected' };
    } catch (error) {
        console.error('Disconnection error:', error);
        return { statusCode: 500, body: 'Failed to disconnect' };
    }
};
