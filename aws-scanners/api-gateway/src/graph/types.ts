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

export interface RouteDetails {
  apiId?: string;
  routeId?: string;
  routeKey?: string;
  target?: string;
  integrationId?: string;
  authorizerId?: string;
  authorizationType?: string;
  authorizationScopes?: string[];
  apiKeyRequired?: boolean;
  operationName?: string;
  managed?: boolean;
}

export interface IntegrationDetails {
  apiId?: string;
  integrationId?: string;
  type?: string;
  subtype?: string;
  uri?: string;
  method?: string;
  connectionType?: string;
  connectionId?: string;
  credentialsArn?: string;
  payloadFormatVersion?: string;
  timeoutInMillis?: number;
  /**
   * ARN of the scanned resource which the integration sends requests to, if it could be resolved.
   */
  resolvedTarget?: string;
  managed?: boolean;
}

export interface AuthorizerDetails {
  apiId?: string;
  authorizerId?: string;
  type?: string;
  uri?: string;
  credentialsArn?: string;
  identitySource?: string[];
  payloadFormatVersion?: string;
  resultTtlInSeconds?: number;
  enableSimpleResponses?: boolean;
  jwt?: {
    audience?: string[];
    issuer?: string;
  };
  /**
   * ARN of the lambda function backing the authorizer, if it could be resolved.
   */
  resolvedTarget?: string;
}

export interface StageDetails {
  apiId?: string;
  stageName?: string;
  autoDeploy?: boolean;
  deploymentId?: string;
  lastDeploymentStatusMessage?: string;
  stageVariables?: Record<string, string>;
  accessLogs?: {
    destinationArn?: string;
    format?: string;
  };
  defaultRouteSettings?: {
    detailedMetricsEnabled?: boolean;
    throttlingBurstLimit?: number;
    throttlingRateLimit?: number;
  };
  managed?: boolean;
}

/**
 * The API Gateway specific state for a node. API nodes populate the top level
 * fields, while nodes for the resources beneath an API populate their own key.
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
  route?: RouteDetails;
  integration?: IntegrationDetails;
  authorizer?: AuthorizerDetails;
  stage?: StageDetails;
}

export type ApiGateway = BaseState<unknown> & {
  apiGateway: ApiGatewayState;
};
export type GraphState = ApiGateway;
