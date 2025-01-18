import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {DeleteItemCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, ScanCommand} from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

import axios from 'axios';

// NODES_TABLE_NAME: nodesTable.tableName,
// POLLING_API_URL: 'https://j9y3r5j656.execute-api.us-east-1.amazonaws.com/prod/',
// CONNECTIONS_TABLE_NAME: 'WebSocketStack-ConnectionsTable8000B8A1-1V4WOAW5OC0MI',
// WEBSOCKET_API_URL: `https://nk1i6lotii.execute-api.us-east-1.amazonaws.com/prod`,
// NODES_API_URL: api.url,
// BUCKET_NAME: bucket.bucketName,
// DEPLOY_TIME: `${Date.now()}`,

enum TaskStatus {
    STARTING = 'starting',
    PROCESSING = 'processing',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed'
}

interface Node {
    description: string; // Security features breakdown, including encryption methods, access controls, and data protection measures.
    pageId: string; // ID of the associated page, e.g., '31a24e90-6e52-40e1-8f5d-c42a71ec9809'
    title: string; // Title of the node, e.g., 'System Requirements'
    type: string; // Type of the node, e.g., 'node'
    createdAt: string; // Timestamp when the node was created, e.g., '2025-01-17T13:46:24.104Z'
    SK: string; // Sort key, e.g., 'NODE#1ee90f22-0cd6-403a-8791-843613ea7124'
    generatedImages: string[]; // List of URLs for generated images
    PK: string; // Partition key, e.g., 'PAGE#31a24e90-6e52-40e1-8f5d-c42a71ec9809'
    id: string; // Unique ID of the node, e.g., '1ee90f22-0cd6-403a-8791-843613ea7124'
    predictionId: string; // ID of the prediction, e.g., '003vfw865hrme0cmej2ab329cw'
    prompt: string; // Text prompt used for prediction, e.g., 'LILY, Full-body shot of a Russian blonde supermodel riding a horse through a scenic meadow...'
    predictionStatus: TaskStatus; // Status of the prediction, e.g., 'succeeded'
    updatedAt: string; // Timestamp when the node was last updated, e.g., '2025-01-17T13:47:27.025Z'
}

interface TaskStatusRecord {
    predictionId: string;
    status: TaskStatus;
    output?: string[];
}

const docClient = createDynamoDBClient();
const dynamoClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const apiClient = new ApiGatewayManagementApiClient({
    // endpoint: "https://<api-id>.execute-api.<region>.amazonaws.com/dev",
    endpoint: process.env.WEBSOCKET_API_URL
});

export function createDynamoDBClient(): DynamoDBDocumentClient {
    const client = new DynamoDBClient({});
    return DynamoDBDocumentClient.from(client);
}

function getDateBasedPath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `images/${year}/${month}/${day}`;
}

export const sendMessageToConnections = async (message: any) => {

    try {
        // Fetch all connection IDs from the DynamoDB table
        const connectionsData = await dynamoClient.send(
            new ScanCommand({ TableName: process.env.CONNECTIONS_TABLE_NAME })
        );

        console.log('Scan result:', connectionsData.Items);

        const connections = connectionsData.Items || [];

        // Send the message to each connection
        const sendPromises = connections.map(async (connection) => {
            console.log(connection)
            const connectionId = connection.connectionId;

            try {
                const command = new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(message),
                });
                await apiClient.send(command);
                console.log(`Message sent to connection: ${connectionId}`);
            } catch (error) {
                // @ts-ignore
                if (error.name === "GoneException") {
                    // Remove stale connection from the table
                    console.log(`Removing stale connection: ${connectionId}`);
                    await dynamoClient.send(
                        new DeleteItemCommand({
                            TableName: process.env.CONNECTIONS_TABLE_NAME,
                            Key: { connectionId: { S: connectionId } },
                        })
                    );
                } else {
                    console.error(`Failed to send message to ${connectionId}:`, error);
                }
            }
        });

        await Promise.all(sendPromises);
        console.log("Message sent to all connections.");
    } catch (error) {
        console.error("Error sending messages to connections:", error);
        throw error;
    }
};

const broadcastMessage = async (broadcastUrl: any, message: any, apiKey = null) => {
    try {
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Add API key to headers if provided
        if (apiKey) {
            // @ts-ignore
            config.headers['x-api-key'] = apiKey;
        }

        // Make POST request to broadcast endpoint
        const response = await axios.post(broadcastUrl, { message }, config);

        console.log('Broadcast successful:', response.data);
    } catch (error) {
        console.log(error)
        // @ts-ignore
        console.error('Error broadcasting message:', error.response?.data || error.message);
    }
};

async function downloadAndUploadToS3(imageUrl: string): Promise<string> {
    try {
        // Download image
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Generate unique filename with date-based path
        const extension = imageUrl.split('.').pop() || 'jpg';
        const filename = `${uuidv4()}.${extension}`;
        const datePath = getDateBasedPath();
        const key = `${datePath}/${filename}`;

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: `image/${extension}`,
        }));

        // Return public URL
        return `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${key}`;
    } catch (error) {
        throw error;
    }
}

async function pollPredictionStatus(predictionId: string): Promise<TaskStatusRecord | null> {
    console.log('pollPredictionStatus')
    try {
        const response = await axios.get(`${process.env.POLLING_API_URL}?predictionId=${predictionId}`);
        const { id, status, output } = response.data;
        console.log({ id, status, output });
        return {
            predictionId: id,
            status,
            output,
        };
    } catch (error) {
        console.log(error);
        return null;
    }
}


export async function handleTaskUpdate(newImage: Node) {
    console.log('handleTaskUpdate')
    let currentStatus = newImage.predictionStatus;
    let attempts = 0;
    const maxAttempts = 20; // ~1 minute total (20 * 3 seconds)

    // If the task is already succeeded, you can skip polling
    if (currentStatus === TaskStatus.SUCCEEDED) {
        return;
    }

    while (currentStatus !== TaskStatus.SUCCEEDED && attempts < maxAttempts) {
        // Wait 3 seconds
        console.log('Polling...', attempts)
        await new Promise(resolve => setTimeout(resolve, 3000));

        const taskStatus = await pollPredictionStatus(newImage.predictionId);
        console.log('taskStatus', JSON.stringify(taskStatus, null ,2))

        if (!taskStatus) {
            // logger.error('Failed to get task update', { predictionId: newImage.predictionId });
            break;
        }



        currentStatus = taskStatus.status;
        attempts++;

        // Once the task has succeeded, fetch images, upload to S3, and update with axios
        if (currentStatus === TaskStatus.SUCCEEDED && taskStatus.output) {
            try {
                // Download and upload images to S3
                const s3Images = await Promise.all(
                    taskStatus.output.map(url => downloadAndUploadToS3(url))
                );

                console.log('s3Images...', s3Images);

                // Example node data to be sent in PUT request:
                // Adjust to match your API’s required fields and structure
                const nodeData = {
                   ...newImage,
                    generatedImages: s3Images,
                    predictionId: taskStatus.predictionId,
                    predictionStatus: taskStatus.status
                };

                console.log({
                    nodeData
                })

                // Make the PUT request with axios
                const putUrl = `${process.env.NODES_API_URL}pages/${newImage.pageId}/nodes/${newImage.id}`;

                console.log(
                    'PUT',
                    JSON.stringify({
                        nodeData,
                        putUrl
                    })
                )

                const response = await axios.put(putUrl, nodeData);
                console.log('PUT request successful:', response.data);

                // await broadcastMessage(`${process.env.WEBSOCKET_API_URL}/@connections`,nodeData)

                await sendMessageToConnections(nodeData)
                console.log('Message sent');
            } catch (error) {
                console.log(error)
                // logger.error('Error updating node data', { error });
            }
        }
    }
}

export const handler = async (event: DynamoDBStreamEvent, context: Context) => {
    console.log(JSON.stringify(event, null ,2));
    for (const record of event.Records) {
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            // Unmarshal the NewImage (only available for INSERT and MODIFY events)

            // "predictionStatus": "starting",
            // "predictionId": "003vfw865hrme0cmej2ab329cw",

            const newImage = record.dynamodb?.NewImage
                // @ts-ignore
                ? unmarshall(record.dynamodb.NewImage) as Node
                : undefined;
            const oldImage = record.dynamodb?.OldImage
                // @ts-ignore
                ? unmarshall(record.dynamodb.OldImage) as Node
                : undefined;
            console.log('newImage',JSON.stringify(newImage, null ,2));
            console.log('oldImage',JSON.stringify(oldImage, null ,2));
            if (newImage) {

                // {
                //     "description": "Step-by-step installation guide with clear instructions and troubleshooting tips for a smooth setup process.",
                //     "pageId": "9412c2ae-c585-4c14-9039-4d631125f3e2",
                //     "title": "Comparison Chart",
                //     "type": "node",
                //     "createdAt": "2025-01-17T18:56:20.098Z",
                //     "SK": "NODE#7a725291-30b0-4cc9-a35c-a3d2ba561a7e",
                //     "generatedImages": [],
                //     "PK": "PAGE#9412c2ae-c585-4c14-9039-4d631125f3e2",
                //     "id": "7a725291-30b0-4cc9-a35c-a3d2ba561a7e",
                //     "predictionId": "6x7x1wnmanrme0cmepfrzgx7dr",
                //     "prompt": "LILY, Over-the-shoulder shot of a Russian blonde supermodel gazing out of a train window, rustic countryside passing by, dressed in a cozy autumn coat and scarf.",
                //     "predictionStatus": "starting",
                //     "updatedAt": "2025-01-17T18:56:29.057Z"
                // }


                if (newImage.predictionStatus === 'starting') {
                    // create poll, after done, donload all images and then save
                    await handleTaskUpdate(newImage)
                }

                if (newImage.predictionStatus === 'succeeded') {

                }
                // await handleTaskUpdate(newImage);
            }
        }
    }
};