import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { GetApis, GetDomainNames } from "./generated/getters";
import { ApiGatewayEntity } from "./graph";

const ApiGatewayV2Scanner: ServiceModule<ApiGatewayV2Client, "aws"> = {
  provider: "aws",
  service: "apigatewayv2",
  key: "ApiGateway",
  arnLabel: "apigateway",
  getClient,
  callPerRegion: true,
  getters: [GetApis, GetDomainNames],
  entities: [ApiGatewayEntity],
};

export type {
  GraphState,
  ApiGateway,
  ApiGatewayState,
  Cors,
  Selections,
} from "./graph";
export default ApiGatewayV2Scanner;
