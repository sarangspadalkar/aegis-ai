import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DataStoreProps {
  vpc: ec2.IVpc;
}

export class DataStore extends Construct {
  readonly dbSecret: secretsmanager.ISecret;
  readonly dbSecurityGroup: ec2.SecurityGroup;
  readonly dbEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStoreProps) {
    super(scope, id);

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: props.vpc,
      description: 'Aegis-AI RDS security group',
      allowAllOutbound: true,
    });

    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow from VPC'
    );

    const credentials = rds.Credentials.fromGeneratedSecret('aegisadmin', {
      secretName: 'aegis-ai/db-credentials',
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Instance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_18,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.dbSecurityGroup],
      credentials,
      databaseName: 'aegisai',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      storageEncrypted: true
    });

    this.dbSecret = dbInstance.secret!;
    this.dbEndpoint = dbInstance.dbInstanceEndpointAddress;
  }

  allowInboundPostgres(connectable: ec2.IConnectable): void {
    this.dbSecurityGroup.addIngressRule(
      connectable.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      'Lambda to RDS'
    );
  }
}
