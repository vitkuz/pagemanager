import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

console.log(path.join(__dirname));

export class VitkuzAwsCdkPagemanagerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda layer
    const layer = new lambda.LayerVersion(this, 'ReplicateLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../scripts/lambda-layer.zip')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Dependencies for Replicate API proxy',
    });

    // DynamoDB Table
    const table = new dynamodb.Table(this, 'PageManagerTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production
    });

    // Global Secondary Indexes
    table.addGlobalSecondaryIndex({
      indexName: 'PublishedPagesIndex',
      partitionKey: { name: 'isPublished', type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'PageNodesIndex',
      partitionKey: { name: 'pageId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Pages Lambda
    const pagesLambda = new lambda.Function(this, 'PagesHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [layer],
      environment: {
        TABLE_NAME: table.tableName,
        DEPLOY_TIME: `${Date.now()}`,
      },
      handler: 'pages/pages.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/lambda')),
    });

    // Nodes Lambda
    const nodesLambda = new lambda.Function(this, 'NodesHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [layer],
      environment: {
        TABLE_NAME: table.tableName,
        DEPLOY_TIME: `${Date.now()}`,
      },
      handler: 'nodes/nodes.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/lambda')),
    });

    // Grant DynamoDB permissions to Lambda functions
    table.grantReadWriteData(pagesLambda);
    table.grantReadWriteData(nodesLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'PageManagerApi', {
      restApiName: 'Page Manager API',
      description: 'API for managing pages and nodes',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

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
      value: table.tableName,
      description: 'DynamoDB Table Name',
    });
  }
}
