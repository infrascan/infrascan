import { RDSClient } from "@aws-sdk/client-rds";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { DescribeDBInstances } from "./generated/getters";
import { getNodes } from "./generated/graph";
import { RDSInstanceEntity } from "./graph";

const RDSScanner: ServiceModule<RDSClient, "aws"> = {
  provider: "aws",
  service: "rds",
  key: "RDS",
  getClient,
  callPerRegion: true,
  getters: [DescribeDBInstances],
  getNodes,
  entities: [RDSInstanceEntity],
};

export default RDSScanner;
