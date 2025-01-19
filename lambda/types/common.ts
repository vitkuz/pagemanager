export enum EntityType {
    PAGE = 'page',
    NODE = 'node'
}

export enum TaskStatus {
    STARTING = 'starting',
    PROCESSING = 'processing',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed'
}

export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE'
}

export enum KeyPrefix {
    PAGE = 'PAGE#',
    NODE = 'NODE#',
    META = 'META#'
}

export interface BaseItem {
    PK: string;
    SK: string;
    createdAt: string;
    updatedAt: string;
    type: EntityType;
}

export interface Page extends BaseItem {
    title: string;
    isPublished: number;
}

export interface Node extends BaseItem {
    title: string;
    description: string;
    prompt: string;
    generatedImages: string[];
    predictionId: string;
    predictionStatus: TaskStatus;
    pageId: string;
}