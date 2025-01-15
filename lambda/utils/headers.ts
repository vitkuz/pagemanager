export const DEFAULT_HEADERS = (requestId: string) => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
    'X-Request-ID': requestId,
    'X-Proxy-Timestamp': new Date().toISOString(),
});