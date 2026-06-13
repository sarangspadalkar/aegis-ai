import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DataStore } from './constructs/data-store';
import { IngestionPipeline } from './constructs/ingestion-pipeline';
import { ProcessorPipeline } from './constructs/processor-pipeline';

export class AegisAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
    });

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

    const dataStore = new DataStore(this, 'DataStore', { vpc });
    const ingestion = new IngestionPipeline(this, 'IngestionPipeline');
    const processor = new ProcessorPipeline(this, 'ProcessorPipeline', {
      vpc,
      dbSecret: dataStore.dbSecret,
      dbEndpoint: dataStore.dbEndpoint,
      mediaBucket: ingestion.mediaBucket,
      processingQueue: ingestion.processingQueue,
      openAiSecret,
    });

    dataStore.allowInboundPostgres(processor.processorLambda);

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: ingestion.mediaBucket.bucketName,
      description: 'S3 bucket for media uploads',
      exportName: 'AegisAi-MediaBucketName',
    });
    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: ingestion.processingQueue.queueUrl,
      description: 'SQS processing queue URL',
      exportName: 'AegisAi-ProcessingQueueUrl',
    });
    new cdk.CfnOutput(this, 'DLQUrl', {
      value: ingestion.dlq.queueUrl,
      description: 'Dead letter queue URL',
      exportName: 'AegisAi-DLQUrl',
    });
  }
}
