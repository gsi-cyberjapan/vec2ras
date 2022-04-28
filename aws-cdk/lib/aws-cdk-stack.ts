import { Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AwsCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // VPC
    const vpc = new ec2.Vpc(this, 'decentralized-vpc', {
      cidr: '10.0.0.0/16',
      defaultInstanceTenancy: ec2.DefaultInstanceTenancy.DEFAULT,
      enableDnsSupport: true,
      enableDnsHostnames: true,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24
        }
      ]
    })

    // Role
    const role = new iam.Role(this, 'decentralized-instance-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        )
      ]
    })

    // Public Security Group
    const pubInstanceSg = new ec2.SecurityGroup(this, 'decentralized-public-instance-security-group', {
      vpc: vpc,
      allowAllOutbound: true
    })
    pubInstanceSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from anywhere')
    // Let's encrypt
    pubInstanceSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP from anywhere')

    // Private Security Group
    const privInstanceSg = new ec2.SecurityGroup(this, 'decentralized-private-instance-security-group', {
      vpc: vpc,
      allowAllOutbound: true
    })
    privInstanceSg.addIngressRule(pubInstanceSg, ec2.Port.tcp(3000), 'HTTP access from public to docker')

    // Hosted Zone
    const publicHostedZone = new route53.PublicHostedZone(this, 'DecentralizedHostedZone', {
      zoneName: 'distributed-vector.net',
    })

    // Private Host zone
    const privateHostZone = new route53.PrivateHostedZone(this, 'DecentralizedPrivateHostedZone', {
      vpc,
      zoneName: 'distributed-vector.internal'
    })

    // user data
    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash" })
    userData.addCommands(
      "apt update",
      "apt install -y software-properties-common",
      "apt install -y ansible",
      "apt install -y git",
    )

    // public instance type
    const pubInstanceType = 't3.small'
    // public instance ebs device size
    const pubEbsVolumeSize = 20
    // private instance type
    const privInstanceType = 't3.micro'
    // private instance ebs device size
    const privEbsVolumeSize = 10

    // EC2 Instance (common)
    const ami = 'ami-036d0684fc96830ca'
    const machineImage = ec2.MachineImage.genericLinux({
      'ap-northeast-1': ami
    })

    // Public instance
    const pubInstance = new ec2.Instance(this, 'decentralized-pub-instance', {
      vpc,
      instanceType: new ec2.InstanceType(pubInstanceType),
      machineImage: machineImage,
      role,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(pubEbsVolumeSize),
        }
      ],
      securityGroup: pubInstanceSg,
      userData,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
    })

    // public elastic ip
    const eip = new ec2.CfnEIP(this, 'PublicElasticIP')
    new ec2.CfnEIPAssociation(this, 'PublicEc2Association', {
      eip: eip.ref,
      instanceId: pubInstance.instanceId
    })

    // assign public
    new route53.ARecord(this, 'PublicInstanceRecord', {
      zone: publicHostedZone,
      target: route53.RecordTarget.fromIpAddresses(eip.ref),
      recordName: 'www'
    })

    const privInstaces = [1, 2, 3, 4]
    for (const i of privInstaces) {
      const _privInstance = new ec2.Instance(this, `decentralized-priv-${i}-instance`, {
        vpc,
        instanceType: new ec2.InstanceType(privInstanceType),
        machineImage: machineImage,
        role,
        blockDevices: [
          {
            deviceName: '/dev/sda1',
            volume: ec2.BlockDeviceVolume.ebs(privEbsVolumeSize),
          }
        ],
        securityGroup: privInstanceSg,
        userData,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        },
      })

      const _privRecordName = `srv${i}`
      // assign private 1
      new route53.ARecord(this, `PrivateInstance${i}Record`, {
        zone: privateHostZone,
        target: route53.RecordTarget.fromIpAddresses(_privInstance.instancePrivateIp),
        recordName: _privRecordName
      })
    }

  }
}
