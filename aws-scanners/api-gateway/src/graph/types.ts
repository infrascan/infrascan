import type { BaseState } from "@infrascan/shared-types";

export interface Selections {
  route?: string;
  apiKey?: string;
}

export interface Cors {
  AllowCredentials?: boolean;
  AllowHeaders?: string[];
  AllowMethods?: string[];
  AllowOrigins?: string[];
  ExposeHeaders?: string[];
  MaxAge?: number;
}

/**
 * The API Gateway specific state for a node.
 */
export interface ApiGatewayState {
  apiId?: string;
  endpoint?: string;
  protocol?: string;
  selections?: Selections;
  managed?: boolean;
  cors?: Cors;
  disableExecuteApiEndpoint?: boolean;
  disableSchemaValidation?: boolean;
  importInfo?: string[];
  version?: string;
  warnings?: string[];
}

export type ApiGateway = BaseState<unknown> & {
  apiGateway: ApiGatewayState;
};
export type GraphState = ApiGateway;
