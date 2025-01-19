import axios from 'axios';
import { TaskStatus } from '../types/common';
import { downloadAndUploadToS3 } from './s3';
import { sendMessageToConnections } from './websocket';
import { getEnvVars } from './env';

const env = getEnvVars();

interface TaskStatusRecord {
    predictionId: string;
    status: TaskStatus;
    output?: string[];
}

export const pollPredictionStatus = async (predictionId: string): Promise<TaskStatusRecord | null> => {
    try {
        const response = await axios.get(`${env.POLLING_API_URL}?predictionId=${predictionId}`);
        const { id, status, output } = response.data;
        return { predictionId: id, status, output };
    } catch (error) {
        console.error('Error polling prediction status:', error);
        return null;
    }
};

export const processSuccessfulPrediction = async (
    predictionId: string,
    output: string[]
): Promise<string[]> => {
    return await Promise.all(
        output.map(url => downloadAndUploadToS3(url, env.BUCKET_NAME))
    );
};

export const updateNodeWithImages = async (
    nodeData: any,
    s3Images: string[]
): Promise<void> => {
    const updatedNode = {
        ...nodeData,
        generatedImages: s3Images,
        predictionStatus: TaskStatus.SUCCEEDED
    };

    const putUrl = `${env.NODES_API_URL}pages/${nodeData.pageId}/nodes/${nodeData.id}`;
    await axios.put(putUrl, updatedNode);
    await sendMessageToConnections(updatedNode);
};