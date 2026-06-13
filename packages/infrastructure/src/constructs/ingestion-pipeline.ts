import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';
import { EnvKeys } from '@aegis-ai/shared';

export class IngestionPipeline extends Construct {
  readonly mediaBucket: s3.Bucket;
  readonly processingQueue: sqs.Queue;
  readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.dlq = new sqs.Queue(this, 'DLQ', {
      queueName: 'aegis-ai-processing-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    this.processingQueue = new sqs.Queue(this, 'Queue', {
      queueName: 'aegis-ai-processing-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(7),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 3,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const ingestionLambda = new lambdaNode.NodejsFunction(this, 'Lambda', {
      functionName: 'aegis-ai-ingestion',
      entry: path.join(__dirname, '../../../ingestion/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        [EnvKeys.PROCESSING_QUEUE_URL]: this.processingQueue.queueUrl,
        [EnvKeys.MEDIA_BUCKET_NAME]: this.mediaBucket.bucketName,
      },
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        nodeModules: ['@aegis-ai/shared'],
        externalModules: [],
      },
    });

    this.mediaBucket.grantRead(ingestionLambda);
    this.processingQueue.grantSendMessages(ingestionLambda);

    this.mediaBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ingestionLambda),
      { suffix: '.txt' }
    );
  }
}
