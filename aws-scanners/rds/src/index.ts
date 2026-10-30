import { RDSClient } from "@aws-sdk/client-rds";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeDBInstances,
  DescribeDBClusters,
  DescribeDBSubnetGroups,
  DescribeDBProxies,
  DescribeDBProxyTargets,
  DescribeGlobalClusters,
} from "./generated/getters";
import { getEdges } from "./edges";
import { entities } from "./graph";

const RDSScanner: ServiceModule<RDSClient, "aws"> = {
  provider: "aws",
  service: "rds",
  key: "RDS",
  getClient,
  callPerRegion: true,
  getters: [
    DescribeDBInstances,
    DescribeDBClusters,
    DescribeDBSubnetGroups,
    DescribeDBProxies,
    DescribeDBProxyTargets,
    DescribeGlobalClusters,
  ],
  getEdges,
  entities,
};

export type {
  GraphState,
  RDSState,
  RDSInstance,
  RDSClusterState,
  RDSProxyState,
  RDSGlobalClusterState,
  ClusterDetails,
  ProxyDetails,
  GlobalClusterDetails,
} from "./graph";

export default RDSScanner;
