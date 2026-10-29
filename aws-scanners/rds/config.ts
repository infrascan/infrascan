import * as RDS from "@aws-sdk/client-rds";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type RDSFunctions =
  | "DescribeDBInstances"
  | "DescribeDBClusters"
  | "DescribeDBSubnetGroups"
  | "DescribeDBProxies"
  | "DescribeDBProxyTargets"
  | "DescribeGlobalClusters";
const RDSScanner: ScannerDefinition<"RDS", typeof RDS, RDSFunctions> = {
  provider: "aws",
  service: "rds",
  clientKey: "RDS",
  key: "RDS",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeDBInstances",
    },
    {
      fn: "DescribeDBClusters",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
    {
      fn: "DescribeDBSubnetGroups",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
    {
      fn: "DescribeDBProxies",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
    {
      fn: "DescribeDBProxyTargets",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
      parameters: [
        {
          Key: "DBProxyName",
          Selector: "RDS|DescribeDBProxies|[]._result.DBProxies[].DBProxyName",
        },
      ],
    },
    {
      fn: "DescribeGlobalClusters",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
  ],
};

export default RDSScanner;
