import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    QueryCommand,
    PutCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
    ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { EntityType, KeyPrefix, Node, Page } from '../types/common';

const dynamodb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamodb);

export const createDynamoDBClient = () => docClient;

export const getPageById = async (tableName: string, pageId: string): Promise<Page | null> => {
    const result = await docClient.send(new GetCommand({
        TableName: tableName,
        Key: {
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: KeyPrefix.META
        }
    }));

    return result.Item as Page || null;
};

export const getAllPages = async (tableName: string): Promise<Page[]> => {
    const result = await docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': KeyPrefix.PAGE,
            ':sk': KeyPrefix.META
        }
    }));

    return (result.Items || []) as Page[];
};

export const createNewPage = async (tableName: string, page: Page): Promise<Page> => {
    await docClient.send(new PutCommand({
        TableName: tableName,
        Item: page
    }));

    return page;
};