import { EC2Client } from "@aws-sdk/client-ec2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { DescribeVpcs, DescribeSubnets } from "./generated/getters";

const EC2Scanner: ServiceModule<EC2Client, "aws"> = {
  provider: "aws",
  service: "ec2",
  key: "EC2-Networking",
  getClient,
  callPerRegion: true,
  getters: [DescribeVpcs, DescribeSubnets],
  entities: [],
};

export default EC2Scanner;
