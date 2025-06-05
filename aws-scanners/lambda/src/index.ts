import { LambdaClient } from "@aws-sdk/client-lambda";
import type { ServiceModule } from "@infrascan/shared-types";
import { ListFunctions, GetFunction, getIamRoles } from "./generated/getters";
import { getClient } from "./generated/client";
import { LambdaFunctionEntity } from "./graph";

const LambdaScanner: ServiceModule<LambdaClient, "aws"> = {
  provider: "aws",
  service: "lambda",
  key: "Lambda",
  getClient,
  callPerRegion: true,
  getters: [ListFunctions, GetFunction],
  getIamRoles,
  entities: [LambdaFunctionEntity],
};

export type {
  GraphState,
  LambdaState,
  CodeDetails,
  FunctionDetails,
  ConcurrencyDetails,
  Layer,
} from "./graph";
export default LambdaScanner;
