import type { RAMClient } from "@aws-sdk/client-ram";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import { GetResourceShares, ListPrincipals, ListResources } from "./getters";
import { getEdges } from "./edges";
import { ResourceShareEntity, StatusEntity } from "./graph";

const RAMScanner: ServiceModule<RAMClient, "aws"> = {
  provider: "aws",
  service: "ram",
  key: "RAM",
  getClient,
  callPerRegion: true,
  getters: [GetResourceShares, ListPrincipals, ListResources],
  getEdges,
  entities: [StatusEntity, ResourceShareEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  RamStatusDetails,
  IncomingResourceShare,
  ResourceShareState,
  ResourceShareDetails,
  ResourceSharePrincipal,
  SharedResource,
} from "./graph";
export type { CallError, CallState } from "./state";
export default RAMScanner;
