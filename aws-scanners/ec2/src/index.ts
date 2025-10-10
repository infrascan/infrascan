import { EC2Client } from "@aws-sdk/client-ec2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeVpcs,
  DescribeSubnets,
  DescribeSecurityGroups,
  DescribeLaunchTemplates,
  DescribeLaunchTemplateVersions,
  DescribeNetworkInterfaces,
  DescribeNatGateways,
} from "./generated/getters";
import {
  LaunchTemplateEntity,
  NatGatewayEntity,
  NetworkInterfaceEntity,
  SecurityGroupEntity,
  SubnetEntity,
  VpcEntity,
} from "./graph";

const EC2Scanner: ServiceModule<EC2Client, "aws"> = {
  provider: "aws",
  service: "ec2",
  key: "EC2-Networking",
  getClient,
  callPerRegion: true,
  getters: [
    DescribeVpcs,
    DescribeSubnets,
    DescribeSecurityGroups,
    DescribeLaunchTemplates,
    DescribeLaunchTemplateVersions,
    DescribeNetworkInterfaces,
    DescribeNatGateways,
  ],
  entities: [
    VpcEntity,
    SubnetEntity,
    SecurityGroupEntity,
    LaunchTemplateEntity,
    NetworkInterfaceEntity,
    NatGatewayEntity,
  ],
};

export type {
  SubnetState,
  SubnetOnLaunch,
  Subnet,
  VpcState,
  VpcConfig,
} from "./graph";

export default EC2Scanner;
