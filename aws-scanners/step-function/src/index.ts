import { SFNClient } from "@aws-sdk/client-sfn";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListStateMachines,
  DescribeStateMachine,
  getIamRoles,
} from "./generated/getters";
import { getNodes } from "./generated/graph";
import { StepFunctionEntity } from "./graph";

const SFNScanner: ServiceModule<SFNClient, "aws"> = {
  provider: "aws",
  service: "sfn",
  key: "SFN",
  getClient,
  callPerRegion: true,
  getters: [ListStateMachines, DescribeStateMachine],
  getNodes,
  getIamRoles,
  entities: [StepFunctionEntity],
};

export default SFNScanner;
