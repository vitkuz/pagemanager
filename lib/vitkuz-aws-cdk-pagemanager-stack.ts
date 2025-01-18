import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

console.log(path.join(__dirname));

export class VitkuzAwsCdkPagemanagerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'Bucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404',
          ttl: cdk.Duration.minutes(1),
        },
      ],
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    // Create Lambda layer
    const layer = new lambda.LayerVersion(this, 'ReplicateLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../scripts/lambda-layer.zip')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Dependencies for Replicate API proxy',
    });

    // DynamoDB Table
    const nodesTable = new dynamodb.Table(this, 'PageManagerTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
    });

    // Global Secondary Indexes
    nodesTable.addGlobalSecondaryIndex({
      indexName: 'PublishedPagesIndex',
      partitionKey: { name: 'isPublished', type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    nodesTable.addGlobalSecondaryIndex({
      indexName: 'PageNodesIndex',
      partitionKey: { name: 'pageId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Pages Lambda
    const pagesLambda = new lambda.Function(this, 'PagesHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [layer],
      environment: {
        TABLE_NAME: nodesTable.tableName,
        DEPLOY_TIME: `${Date.now()}`,
      },
      handler: 'pages/pages.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/lambda')),
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: cdk.Duration.seconds(30),
    });

    // Nodes Lambda
    const nodesLambda = new lambda.Function(this, 'NodesHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [layer],
      environment: {
        TABLE_NAME: nodesTable.tableName,
        DEPLOY_TIME: `${Date.now()}`,
      },
      // todo: add lambda timeout
      handler: 'nodes/nodes.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/lambda')),
      logRetention: logs.RetentionDays.ONE_DAY,
    });

    // Grant DynamoDB permissions to Lambda functions
    nodesTable.grantReadWriteData(pagesLambda);
    nodesTable.grantReadWriteData(nodesLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'PageManagerApi', {
      restApiName: 'Page Manager API',
      description: 'API for managing pages and nodes',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });


    const asyncTaskLambda = new lambda.Function(this, 'TaskHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [layer],
      environment: {
        NODES_TABLE_NAME: nodesTable.tableName,
        POLLING_API_URL: 'https://j9y3r5j656.execute-api.us-east-1.amazonaws.com/prod/',
        CONNECTIONS_TABLE_NAME: 'WebSocketStack-ConnectionsTable8000B8A1-1V4WOAW5OC0MI',
        WEBSOCKET_API_URL: `https://nk1i6lotii.execute-api.us-east-1.amazonaws.com/prod`,
        NODES_API_URL: api.url,
        BUCKET_NAME: bucket.bucketName,
        DEPLOY_TIME: `${Date.now()}`,
      },
      timeout: cdk.Duration.seconds(900),
      handler: 'task/task.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/lambda')),
      logRetention: logs.RetentionDays.ONE_DAY,
    });
    nodesTable.grantReadWriteData(asyncTaskLambda);
    bucket.grantReadWrite(asyncTaskLambda);


    // Add permissions for DynamoDB and WebSocket API
    asyncTaskLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["execute-api:ManageConnections"],
          resources: [
            "arn:aws:execute-api:us-east-1:582347504313:nk1i6lotii/*", // Replace <account-id> with your AWS Account ID
          ],
        })
    );

    asyncTaskLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["dynamodb:Scan", "dynamodb:DeleteItem"],
          resources: [
            "arn:aws:dynamodb:us-east-1:582347504313:table/WebSocketStack-ConnectionsTable8000B8A1-1V4WOAW5OC0MI", // Replace <account-id> with your AWS Account ID
          ],
        })
    );


    asyncTaskLambda.addEventSource(new lambdaEventSources.DynamoEventSource(nodesTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1, // Optional: Customize the batch size for processing
    }));

    // Pages endpoints
    const pages = api.root.addResource('pages');
    pages.addMethod('GET', new apigateway.LambdaIntegration(pagesLambda));
    pages.addMethod('POST', new apigateway.LambdaIntegration(pagesLambda));

    const page = pages.addResource('{id}');
    page.addMethod('GET', new apigateway.LambdaIntegration(pagesLambda));
    page.addMethod('PUT', new apigateway.LambdaIntegration(pagesLambda));
    page.addMethod('DELETE', new apigateway.LambdaIntegration(pagesLambda));

    // Nodes endpoints
    const nodes = page.addResource('nodes');
    nodes.addMethod('GET', new apigateway.LambdaIntegration(nodesLambda));
    nodes.addMethod('POST', new apigateway.LambdaIntegration(nodesLambda));

    const node = nodes.addResource('{nodeId}');
    node.addMethod('DELETE', new apigateway.LambdaIntegration(nodesLambda));
    node.addMethod('PUT', new apigateway.LambdaIntegration(nodesLambda));

    // Stack Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: nodesTable.tableName,
      description: 'DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'BucketUrl', {
      value: bucket.bucketWebsiteUrl,
      description: 'S3 Bucket Website URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

  }
}
