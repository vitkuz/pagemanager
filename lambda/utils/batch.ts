import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from './dynamodb';

const docClient = createDynamoDBClient();

export const batchDeleteItems = async (
    tableName: string,
    items: { PK: string; SK: string }[],
    batchSize = 25
): Promise<void> => {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await docClient.send(new BatchWriteCommand({
            RequestItems: {
                [tableName]: batch.map(item => ({
                    DeleteRequest: {
                        Key: {
                            PK: item.PK,
                            SK: item.SK
                        }
                    }
                }))
            }
        }));
    }
};