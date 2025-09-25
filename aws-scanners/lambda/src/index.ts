import { LambdaClient } from "@aws-sdk/client-lambda";
import type { ServiceModule } from "@infrascan/shared-types";
import {
  ListFunctions,
  GetFunction,
  ListEventSourceMappings,
  getIamRoles,
} from "./generated/getters";
import { getClient } from "./generated/client";
import { LambdaEventSourceEntity, LambdaFunctionEntity } from "./graph";

const LambdaScanner: ServiceModule<LambdaClient, "aws"> = {
  provider: "aws",
  service: "lambda",
  key: "Lambda",
  getClient,
  callPerRegion: true,
  getters: [ListFunctions, GetFunction, ListEventSourceMappings],
  getIamRoles,
  entities: [LambdaFunctionEntity, LambdaEventSourceEntity],
};

export type {
  GraphState,
  LambdaState,
  CodeDetails,
  FunctionDetails,
  ConcurrencyDetails,
  Layer,
  ErrorHandling,
  EventProducers,
  EventSource,
  EventSourceMapping,
  EventSourceStatus,
  ReaderConfig,
  ProcessingConfig,
} from "./graph";
export default LambdaScanner;
