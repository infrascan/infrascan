import { EC2Client } from "@aws-sdk/client-ec2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeVpcs,
  DescribeSubnets,
  DescribeSecurityGroups,
  DescribeLaunchTemplates,
  DescribeLaunchTemplateVersions,
} from "./generated/getters";
import {
  LaunchTemplateEntity,
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
  ],
  entities: [
    VpcEntity,
    SubnetEntity,
    SecurityGroupEntity,
    LaunchTemplateEntity,
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
