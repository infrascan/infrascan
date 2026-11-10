import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeOrganizationsAccess,
  DescribeStackSet,
  ListStackInstances,
  ListStackSets,
} from "./getters";
import { getEdges } from "./edges";
import { StackSetEntity, StatusEntity } from "./graph";

const CloudFormationScanner: ServiceModule<CloudFormationClient, "aws"> = {
  provider: "aws",
  service: "cloudformation",
  key: "CloudFormation",
  getClient,
  callPerRegion: true,
  // Order matters: later getters read the stack sets recorded by `ListStackSets`.
  getters: [
    DescribeOrganizationsAccess,
    ListStackSets,
    DescribeStackSet,
    ListStackInstances,
  ],
  getEdges,
  entities: [StatusEntity, StackSetEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  CloudFormationStatusDetails,
  StackSetReferenceDetails,
  StackSetState,
  StackSetDetails,
  StackInstanceDetails,
} from "./graph";
export type { CallError, CallState } from "./state";
export default CloudFormationScanner;
