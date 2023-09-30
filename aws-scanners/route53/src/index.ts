import { Route53Client } from "@aws-sdk/client-route-53";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListHostedZonesByName,
  ListResourceRecordSets,
} from "./generated/getters";
import { getNodes } from "./generated/graph";
import { getEdges } from "./edges";

const Route53Scanner: ServiceModule<Route53Client, "aws"> = {
  provider: "aws",
  service: "route-53",
  key: "Route53",
  getClient,
  callPerRegion: true,
  getters: [ListHostedZonesByName, ListResourceRecordSets],
  getNodes,
  getEdges,
};

export default Route53Scanner;
