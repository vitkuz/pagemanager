// Import necessary AWS CDK libraries
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import {Construct} from 'constructs';
import path from 'path';

export class WebSocketStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const stageName = 'prod';

        // DynamoDB table to manage WebSocket connections
        const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
            partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create WebSocket API with Lambda integrations
        const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
            // connectRouteOptions: { integration: new WebSocketLambdaIntegration(getResourceId('ConnectIntegration'), connectHandler) },
            // disconnectRouteOptions: { integration: new WebSocketLambdaIntegration(getResourceId('DisconnectIntegration'), disconnectHandler) },
            // defaultRouteOptions: { integration: new WebSocketLambdaIntegration('BroadcastIntegration', broadcastHandler) },
        });

        // Format the HTTPS endpoint for API_GATEWAY_ENDPOINT
        const httpsApiEndpoint = `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${stageName}`;


        // Lambda to handle WebSocket connection
        const connectHandler = new lambda.Function(this, 'ConnectHandler', {
            runtime: lambda.Runtime.NODEJS_20_X,
            // code: lambda.Code.fromAsset('src'),
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket')),
            handler: 'connect.handler',
            logRetention: logs.RetentionDays.ONE_DAY,
            timeout: cdk.Duration.seconds(30),
            environment: {
                TABLE_NAME: connectionsTable.tableName,
                API_GATEWAY_ENDPOINT: httpsApiEndpoint,
                DEPLOY_TIME: `${Date.now()}`
            },
        });

        // Lambda to handle WebSocket disconnection
        const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
            runtime: lambda.Runtime.NODEJS_20_X,
            // code: lambda.Code.fromAsset('src'),
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket')),
            handler: 'disconnect.handler',
            logRetention: logs.RetentionDays.ONE_DAY,
            timeout: cdk.Duration.seconds(30),
            environment: {
                TABLE_NAME: connectionsTable.tableName,
                API_GATEWAY_ENDPOINT: httpsApiEndpoint,
                DEPLOY_TIME: `${Date.now()}`
            },
        });

        // Grant connect/disconnect Lambdas permissions to write to DynamoDB
        connectionsTable.grantWriteData(connectHandler);
        connectionsTable.grantWriteData(disconnectHandler);


        // Lambda to broadcast messages to all connected clients
        const broadcastHandler = new lambda.Function(this, 'BroadcastHandler', {
            runtime: lambda.Runtime.NODEJS_20_X,
            // code: lambda.Code.fromAsset('src'),
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket')),
            handler: 'broadcast.handler',
            logRetention: logs.RetentionDays.ONE_DAY,
            timeout: cdk.Duration.seconds(30),
            environment: {
                TABLE_NAME: connectionsTable.tableName,
                API_GATEWAY_ENDPOINT: httpsApiEndpoint,
                DEPLOY_TIME: `${Date.now()}`
            },
        });

        // Grant broadcast Lambda permissions to read from DynamoDB and send messages via WebSocket
        connectionsTable.grantReadWriteData(broadcastHandler);

        broadcastHandler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['execute-api:ManageConnections'],
                resources: ['arn:aws:execute-api:*:*:*/*'],
            })
        );

        webSocketApi.addRoute('$connect', {
            integration: new WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
        });

        webSocketApi.addRoute('$disconnect', {
            integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
        });

        webSocketApi.addRoute('$default', {
            integration: new WebSocketLambdaIntegration('BroadcastIntegration', broadcastHandler),
        });

        // Create WebSocket stage
        new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
            webSocketApi,
            stageName: stageName,
            autoDeploy: true,
        });

    }
}
