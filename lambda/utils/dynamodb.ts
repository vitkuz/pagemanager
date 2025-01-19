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
import { EntityType, KeyPrefix, Page, Node } from '../types/common';
import { batchDeleteItems } from './batch';

const dynamodb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamodb);

export const getPageNodes = async (tableName: string, pageId: string): Promise<Node[]> => {
    const result = await docClient.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `${KeyPrefix.PAGE}${pageId}`,
            ':sk': KeyPrefix.NODE
        }
    }));

    return (result.Items || []) as Node[];
};

export const deletePage = async (tableName: string, pageId: string): Promise<void> => {
    // First, get all nodes for this page
    const nodes = await getPageNodes(tableName, pageId);

    // Delete all nodes if they exist
    if (nodes.length > 0) {
        await batchDeleteItems(
            tableName,
            nodes.map(node => ({
                PK: node.PK,
                SK: node.SK
            }))
        );
    }

    // Delete the page itself
    await docClient.send(new DeleteCommand({
        TableName: tableName,
        Key: {
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: KeyPrefix.META
        }
    }));
};

export const createPage = async (
    tableName: string,
    pageData: {id: string;} & Partial<Page>
): Promise<Page> => {
    const timestamp = new Date().toISOString();

    const page: Page = {
        id: pageData.id,
        PK: `${KeyPrefix.PAGE}${pageData.id}`,
        SK: KeyPrefix.META,
        createdAt: timestamp,
        updatedAt: timestamp,
        type: EntityType.PAGE,
        title: pageData.title || '',
        isPublished: pageData.isPublished ? 1 : 0
    };

    await docClient.send(new PutCommand({
        TableName: tableName,
        Item: page
    }));

    return page;
};

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

export const updatePageById = async (
    tableName: string,
    pageId: string,
    updates: Partial<Page>
): Promise<Page | null> => {
    // Build update expression and values dynamically
    const timestamp = new Date().toISOString();
    let updateExpression = 'set updatedAt = :timestamp';
    const expressionAttributeValues: Record<string, any> = {
        ':timestamp': timestamp
    };
    const expressionAttributeNames: Record<string, string> = {
        '#updatedAt': 'updatedAt'
    };

    // Add all fields from updates except protected ones
    const protectedFields = ['PK', 'SK', 'createdAt', 'type'];
    Object.entries(updates).forEach(([key, value]) => {
        if (!protectedFields.includes(key)) {
            const placeholder = `#${key}`;
            updateExpression += `, ${placeholder} = :${key}`;
            expressionAttributeNames[placeholder] = key;
            expressionAttributeValues[`:${key}`] = key === 'isPublished' ? (value ? 1 : 0) : value;
        }
    });

    const result = await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: {
            PK: `${KeyPrefix.PAGE}${pageId}`,
            SK: KeyPrefix.META
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes as Page || null;
};