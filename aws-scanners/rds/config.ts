import * as RDS from "@aws-sdk/client-rds";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type RDSFunctions = "DescribeDBInstances";
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
  ],
};

export default RDSScanner;
