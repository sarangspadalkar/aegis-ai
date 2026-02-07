import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';

export class AegisAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- S3 bucket for media uploads ---
    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: undefined, // let CDK generate
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- Dead Letter Queue (DLQ) for failed processing ---
    const dlq = new sqs.Queue(this, 'ProcessingDLQ', {
      queueName: 'aegis-ai-processing-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // --- Main processing queue with redrive to DLQ and retry ---
    const processingQueue = new sqs.Queue(this, 'ProcessingQueue', {
      queueName: 'aegis-ai-processing-queue',
      visibilityTimeout: cdk.Duration.seconds(300), // 5 min for LLM calls
      retentionPeriod: cdk.Duration.days(4),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // long polling
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3, // retry up to 3 times before DLQ
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // --- OpenAI API key secret (create placeholder; user must set value) ---
    const openAiSecret = new secretsmanager.Secret(this, 'OpenAIApiKeySecret', {
      secretName: 'aegis-ai/openai-api-key',
      description: 'OpenAI API key for Aegis-AI summarization and embeddings',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ OPENAI_API_KEY: 'replace-me' }),
        generateStringKey: 'OPENAI_API_KEY',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // --- VPC for RDS (minimal for serverless Lambda compatibility: use default VPC or create minimal) ---
    const vpc = new ec2.Vpc(this, 'AegisVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    // --- Security group for RDS ---
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Aegis-AI RDS security group',
      allowAllOutbound: true,
    });

    // --- RDS PostgreSQL with pgvector (single instance for cost; can switch to Aurora) ---
    const dbCredentials = rds.Credentials.fromGeneratedSecret('aegisadmin', {
      secretName: 'aegis-ai/db-credentials',
    });

    const dbInstance = new rds.DatabaseInstance(this, 'AegisDb', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      credentials: dbCredentials,
      databaseName: 'aegisai',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Allow Lambda to connect to RDS (we'll add Lambda to VPC or use RDS Proxy; for simplicity we use private subnets and allow Lambda in VPC)
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow from VPC'
    );

    // Store DB connection info in Secrets Manager for Lambda
    const dbSecret = dbInstance.secret!;

    // --- Lambda: Ingestion (S3 event -> enqueue to SQS) ---
    const ingestionLambda = new lambdaNode.NodejsFunction(this, 'IngestionLambda', {
      functionName: 'aegis-ai-ingestion',
      entry: path.join(__dirname, '../../ingestion/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        MEDIA_BUCKET_NAME: mediaBucket.bucketName,
      },
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        nodeModules: ['@aegis-ai/shared'],
        externalModules: [],
      },
    });

    mediaBucket.grantRead(ingestionLambda);
    processingQueue.grantSendMessages(ingestionLambda);

    mediaBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ingestionLambda),
      { suffix: '.txt' }
    );

    // --- Lambda: Processor (SQS -> OpenAI -> pgvector) - in VPC to reach RDS ---
    const processorLambda = new lambdaNode.NodejsFunction(this, 'ProcessorLambda', {
      functionName: 'aegis-ai-processor',
      entry: path.join(__dirname, '../../processor/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        MEDIA_BUCKET_NAME: mediaBucket.bucketName,
        OPENAI_SECRET_ARN: openAiSecret.secretArn,
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_NAME: 'aegisai',
      },
      tracing: lambda.Tracing.ACTIVE,
      retryAttempts: 0, // we use SQS retries + DLQ
      bundling: {
        nodeModules: ['@aegis-ai/shared', '@aegis-ai/database', 'openai', '@prisma/client'],
        externalModules: ['@aws-sdk/*'],
      },
    });

    processingQueue.grantConsumeMessages(processorLambda);
    mediaBucket.grantRead(processorLambda);
    openAiSecret.grantRead(processorLambda);
    dbSecret.grantRead(processorLambda);
    dbSecurityGroup.addIngressRule(
      processorLambda.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      'Lambda to RDS'
    );

    processorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(processingQueue, { batchSize: 1 })
    );

    // --- Outputs ---
    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaBucket.bucketName,
      description: 'S3 bucket for media uploads',
      exportName: 'AegisAi-MediaBucketName',
    });
    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: processingQueue.queueUrl,
      description: 'SQS processing queue URL',
      exportName: 'AegisAi-ProcessingQueueUrl',
    });
    new cdk.CfnOutput(this, 'DLQUrl', {
      value: dlq.queueUrl,
      description: 'Dead letter queue URL',
      exportName: 'AegisAi-DLQUrl',
    });
  }
}
