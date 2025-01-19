import {DynamoDBStreamEvent, Context, DynamoDBRecord} from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Node, TaskStatus} from '../types/common';
import { pollPredictionStatus, processSuccessfulPrediction, updateNodeWithImages } from '../utils/task';
import {AttributeValue} from "@aws-sdk/client-dynamodb";

const MAX_POLLING_ATTEMPTS = 20; // ~1 minute total (20 * 3 seconds)
const POLLING_INTERVAL = 3000; // 3 seconds

export const handler = async (event: DynamoDBStreamEvent, context: Context) => {
    for (const record of event.Records) {
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            const newImage = record.dynamodb?.NewImage
                ? unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>) as Node
                : undefined;

            if (newImage?.predictionStatus === TaskStatus.STARTING) {
                let currentStatus: TaskStatus = TaskStatus.STARTING;
                let attempts = 0;

                while (currentStatus !== TaskStatus.SUCCEEDED && attempts < MAX_POLLING_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                    attempts++;

                    const taskResponse = await pollPredictionStatus(newImage.predictionId);
                    if (!taskResponse) continue;

                    currentStatus = taskResponse.status;

                    if (currentStatus === TaskStatus.SUCCEEDED && taskResponse.output) {
                        try {
                            const s3Images = await processSuccessfulPrediction(
                                taskResponse.predictionId,
                                taskResponse.output
                            );
                            await updateNodeWithImages(newImage, s3Images);
                        } catch (error) {
                            console.error('Error processing successful prediction:', error);
                        }
                    }
                }
            }
        }
    }
};