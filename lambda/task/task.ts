import {DynamoDBStreamEvent, Context, DynamoDBRecord} from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Node, TaskStatus} from '../types/common';
import { pollPredictionStatus, processSuccessfulPrediction, updateNodeWithImages } from '../utils/task';
import {AttributeValue} from "@aws-sdk/client-dynamodb";

const MAX_POLLING_ATTEMPTS = 20; // ~1 minute total (20 * 3 seconds)
const POLLING_INTERVAL = 3000; // 3 seconds

export const handler = async (event: DynamoDBStreamEvent, context: Context) => {
    console.log('Task Lambda invoked:', JSON.stringify({
        requestId: context.awsRequestId,
        event
    }, null, 2));

    for (const record of event.Records) {
        console.log('Processing record:', JSON.stringify({
            eventId: record.eventID,
            eventName: record.eventName,
            recordType: record.eventSource
        }, null, 2));

        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            const newImage = record.dynamodb?.NewImage
                ? unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>) as Node
                : undefined;

            console.log('Unmarshalled new image:', JSON.stringify(newImage, null, 2));

            if (newImage?.predictionStatus === TaskStatus.STARTING) {
                console.log('Starting prediction polling for:', JSON.stringify({
                    nodeId: newImage.id,
                    predictionId: newImage.predictionId
                }, null, 2));

                let currentStatus: TaskStatus = TaskStatus.STARTING;
                let attempts = 0;

                while (currentStatus !== TaskStatus.SUCCEEDED && attempts < MAX_POLLING_ATTEMPTS) {
                    console.log('Polling attempt:', JSON.stringify({
                        attempt: attempts + 1,
                        maxAttempts: MAX_POLLING_ATTEMPTS,
                        predictionId: newImage.predictionId,
                        currentStatus
                    }, null, 2));

                    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                    attempts++;

                    const taskResponse = await pollPredictionStatus(newImage.predictionId);
                    if (!taskResponse) {
                        console.log('No task response received, continuing to next attempt');
                        continue;
                    }

                    console.log('Task status response:', JSON.stringify(taskResponse, null, 2));

                    currentStatus = taskResponse.status;

                    if (currentStatus === TaskStatus.SUCCEEDED && taskResponse.output) {
                        console.log('Task succeeded, processing images');
                        try {
                            const s3Images = await processSuccessfulPrediction(
                                taskResponse.predictionId,
                                taskResponse.output
                            );
                            console.log('Images processed and uploaded:', JSON.stringify(s3Images, null, 2));

                            await updateNodeWithImages(newImage, s3Images);
                            console.log('Node updated with new images');
                        } catch (error) {
                            console.error('Error processing successful prediction:', JSON.stringify({
                                error,
                                nodeId: newImage.id,
                                predictionId: newImage.predictionId
                            }, null, 2));
                        }
                    }
                }

                if (attempts >= MAX_POLLING_ATTEMPTS) {
                    console.log('Max polling attempts reached:', JSON.stringify({
                        nodeId: newImage.id,
                        predictionId: newImage.predictionId,
                        finalStatus: currentStatus
                    }, null, 2));
                }
            }
        }
    }
    console.log('Task Lambda execution completed');
};