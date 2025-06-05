import { SFNClient } from "@aws-sdk/client-sfn";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListStateMachines,
  DescribeStateMachine,
  getIamRoles,
} from "./generated/getters";
import { StepFunctionEntity } from "./graph";

const SFNScanner: ServiceModule<SFNClient, "aws"> = {
  provider: "aws",
  service: "sfn",
  key: "SFN",
  getClient,
  callPerRegion: true,
  getters: [ListStateMachines, DescribeStateMachine],
  getIamRoles,
  entities: [StepFunctionEntity],
};

export type { GraphState, StepFunctionState } from "./graph";

export default SFNScanner;
