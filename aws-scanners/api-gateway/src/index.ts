import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { GetApis, GetDomainNames } from "./generated/getters";
import { getNodes } from "./generated/graph";
import { ApiGatewayEntity } from "./graph";

const ApiGatewayV2Scanner: ServiceModule<ApiGatewayV2Client, "aws"> = {
  provider: "aws",
  service: "apigatewayv2",
  key: "ApiGateway",
  getClient,
  callPerRegion: true,
  getters: [GetApis, GetDomainNames],
  getNodes,
  entities: [ApiGatewayEntity],
};

export default ApiGatewayV2Scanner;
