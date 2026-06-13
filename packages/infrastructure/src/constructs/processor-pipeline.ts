import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { EnvKeys } from '@aegis-ai/shared';

export interface ProcessorPipelineProps {
  vpc: ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  dbEndpoint: string;
  mediaBucket: s3.IBucket;
  processingQueue: sqs.IQueue;
  openAiSecret: secretsmanager.ISecret;
}

export class ProcessorPipeline extends Construct {
  readonly processorLambda: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: ProcessorPipelineProps) {
    super(scope, id);

    this.processorLambda = new lambdaNode.NodejsFunction(this, 'Lambda', {
      functionName: 'aegis-ai-processor',
      entry: path.join(__dirname, '../../../processor/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        [EnvKeys.OPENAI_SECRET_ARN]: props.openAiSecret.secretArn,
        [EnvKeys.DB_SECRET_ARN]: props.dbSecret.secretArn,
        [EnvKeys.DB_HOST]: props.dbEndpoint,
        [EnvKeys.DB_NAME]: 'aegisai',
      },
      tracing: lambda.Tracing.ACTIVE,
      retryAttempts: 0,
      bundling: {
        nodeModules: ['@aegis-ai/shared', '@aegis-ai/database', 'openai', '@prisma/client'],
        externalModules: ['@aws-sdk/*'],
      },
    });

    props.processingQueue.grantConsumeMessages(this.processorLambda);
    props.mediaBucket.grantRead(this.processorLambda);
    props.openAiSecret.grantRead(this.processorLambda);
    props.dbSecret.grantRead(this.processorLambda);

    this.processorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(props.processingQueue, { batchSize: 1 })
    );
  }
}
