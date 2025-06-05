import { Route53Client } from "@aws-sdk/client-route-53";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListHostedZonesByName,
  ListResourceRecordSets,
} from "./generated/getters";
import { getEdges } from "./edges";
import { Route53RecordEntity } from "./graph";

const Route53Scanner: ServiceModule<Route53Client, "aws"> = {
  provider: "aws",
  service: "route-53",
  key: "Route53",
  getClient,
  callPerRegion: false,
  getters: [ListHostedZonesByName, ListResourceRecordSets],
  getEdges,
  entities: [Route53RecordEntity],
};

export type { GraphState, Route53State } from "./graph";
export default Route53Scanner;
