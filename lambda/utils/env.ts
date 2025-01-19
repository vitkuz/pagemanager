// Environment variable validation
const requiredEnvVars = [
    'TABLE_NAME',
    'POLLING_API_URL',
    'CONNECTIONS_TABLE_NAME',
    'WEBSOCKET_API_URL',
    'NODES_API_URL',
    'BUCKET_NAME'
] as const;

export type EnvVars = Record<typeof requiredEnvVars[number], string>;

export const getEnvVars = (): EnvVars => {
    const missingVars = requiredEnvVars.filter(key => !process.env[key]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return requiredEnvVars.reduce((acc, key) => ({
        ...acc,
        [key]: process.env[key]!
    }), {} as EnvVars);
};