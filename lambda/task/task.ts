import { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Node, TaskStatus } from '../types/common';
import { pollPredictionStatus, processSuccessfulPrediction, updateNodeWithImages } from '../utils/task';

const MAX_POLLING_ATTEMPTS = 20; // ~1 minute total (20 * 3 seconds)
const POLLING_INTERVAL = 3000; // 3 seconds

export const handler = async (event: DynamoDBStreamEvent, context: Context) => {
    for (const record of event.Records) {
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            const newImage = record.dynamodb?.NewImage
                ? unmarshall(record.dynamodb.NewImage)
                : undefined;

            if (newImage?.predictionStatus === TaskStatus.STARTING) {
                let currentStatus = newImage.predictionStatus;
                let attempts = 0;

                while (currentStatus !== TaskStatus.SUCCEEDED && attempts < MAX_POLLING_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                    attempts++;

                    const taskStatus = await pollPredictionStatus(newImage.predictionId);
                    if (!taskStatus) continue;

                    currentStatus = taskStatus.status;

                    if (currentStatus === TaskStatus.SUCCEEDED && taskStatus.output) {
                        try {
                            const s3Images = await processSuccessfulPrediction(
                                taskStatus.predictionId,
                                taskStatus.output
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