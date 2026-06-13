import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AegisAiStack } from '../aegis-ai-stack';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new AegisAiStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  template = Template.fromStack(stack);
}, 300_000);

// ─── DataStore ───────────────────────────────────────────────────────────────

describe('DataStore', () => {
  it('creates exactly one VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  it('provisions RDS PostgreSQL 18', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '18',
    });
  });

  it('uses t3.micro instance class', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t3.micro',
    });
  });

  it('RDS instance has RETAIN removal policy', () => {
    template.hasResource('AWS::RDS::DBInstance', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });
});

// ─── IngestionPipeline ────────────────────────────────────────────────────────

describe('IngestionPipeline', () => {
  it('S3 bucket has versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('processing queue has 300s visibility timeout', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 300,
    });
  });

  it('processing queue uses 20s long polling', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      ReceiveMessageWaitTimeSeconds: 20,
    });
  });

  it('processing queue redrive to DLQ with maxReceiveCount 3 (matches CONTEXT.md Retry)', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    });
  });

  it('DLQ retains messages for 14 days', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 14 * 24 * 60 * 60,
    });
  });

  it('ingestion Lambda has 256 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 256,
    });
  });

  it('ingestion Lambda has 30s timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 30,
    });
  });

  it('exactly two SQS queues exist (processing queue and DLQ)', () => {
    template.resourceCountIs('AWS::SQS::Queue', 2);
  });
});

// ─── ProcessorPipeline ────────────────────────────────────────────────────────

describe('ProcessorPipeline', () => {
  it('processor Lambda has 512 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
    });
  });

  it('processor Lambda has 300s timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 300,
    });
  });

  it('processor Lambda is deployed inside VPC', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
      VpcConfig: Match.anyValue(),
    });
  });

  it('processor Lambda has X-Ray active tracing', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
      TracingConfig: { Mode: 'Active' },
    });
  });

  it('processor Lambda retryAttempts is 0 — SQS + DLQ own the retry lifecycle', () => {
    template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      MaximumRetryAttempts: 0,
    });
  });

  it('SQS event source configured with batchSize 1', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
    });
  });
});

// ─── Cross-construct invariants ────────────────────────────────────────────────

describe('cross-construct invariants', () => {
  it('SQS visibility timeout (300s) is not less than processor Lambda timeout (300s)', () => {
    // If visibility < Lambda timeout, SQS re-delivers the same Job before processing
    // finishes, causing duplicate work and burning DLQ retries.
    const queues = template.findResources('AWS::SQS::Queue');
    const maxVisibility = Math.max(
      ...Object.values(queues).map((q: any) => q.Properties?.VisibilityTimeout ?? 0)
    );

    const fns = template.findResources('AWS::Lambda::Function');
    const maxTimeout = Math.max(...Object.values(fns).map((f: any) => f.Properties?.Timeout ?? 0));

    expect(maxVisibility).toBeGreaterThanOrEqual(maxTimeout);
  });
});
