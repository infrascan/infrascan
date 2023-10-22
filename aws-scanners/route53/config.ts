import * as Route53 from "@aws-sdk/client-route-53";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type Route53Functions =
  | "ListHostedZonesByName"
  | "ListResourceRecordSets";

const Route53Scanner: ScannerDefinition<
  "Route53",
  typeof Route53,
  Route53Functions
> = {
  provider: "aws",
  service: "route-53",
  clientKey: "Route53",
  key: "Route53",
  callPerRegion: false,
  getters: [
    {
      fn: "ListHostedZonesByName",
    },
    {
      fn: "ListResourceRecordSets",
      parameters: [
        {
          Key: "HostedZoneId",
          Selector: "Route53|ListHostedZonesByName|[]._result.HostedZones[].Id",
        },
      ],
    },
  ],
  nodes: [
    "Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==`A`] | [].{id:Name,name:Name}",
  ],
};

export default Route53Scanner;
