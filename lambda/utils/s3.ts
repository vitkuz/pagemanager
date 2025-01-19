import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({});

const getDateBasedPath = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `images/${year}/${month}/${day}`;
};

export const downloadAndUploadToS3 = async (imageUrl: string, bucketName: string): Promise<string> => {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const extension = imageUrl.split('.').pop() || 'jpg';
    const filename = `${uuidv4()}.${extension}`;
    const key = `${getDateBasedPath()}/${filename}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: `image/${extension}`,
    }));

    return `https://${bucketName}.s3.amazonaws.com/${key}`;
};