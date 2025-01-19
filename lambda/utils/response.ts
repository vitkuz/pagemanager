import { APIGatewayProxyResult } from 'aws-lambda';
import { DEFAULT_HEADERS } from './headers';

interface ErrorResponse {
    message: string;
    details?: any;
}

interface SuccessResponse<T> {
    data: T;
    meta?: {
        count?: number;
        page?: number;
        totalPages?: number;
        message?:string;
    };
}

export const createResponse = <T>(
    statusCode: number,
    data: T,
    requestId: string,
    meta?: SuccessResponse<T>['meta']
): APIGatewayProxyResult => ({
    statusCode,
    headers: DEFAULT_HEADERS(requestId),
    body: JSON.stringify({ data, ...(meta ? { meta } : {}) })
});

export const createErrorResponse = (
    statusCode: number,
    message: string,
    requestId: string,
    details?: any
): APIGatewayProxyResult => ({
    statusCode,
    headers: DEFAULT_HEADERS(requestId),
    body: JSON.stringify({ error: { message, ...(details ? { details } : {}) } })
});