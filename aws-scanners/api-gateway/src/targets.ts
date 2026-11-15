import type { Authorizer, Integration } from "@aws-sdk/client-apigatewayv2";

export const DEFAULT_PARTITION = "aws";

/**
 * The account, region and partition that a piece of API Gateway state was scanned in.
 * Used to build ARNs for resources which integrations reference by name or URL.
 */
export interface ScanLocation {
  account: string;
  region: string;
  partition?: string;
}

/**
 * Builds the ARN of an HTTP or WebSocket API, which is used as its node id.
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/arn-format-reference.html
 */
export function formatApiArn(
  region: string,
  apiId: string,
  partition: string = DEFAULT_PARTITION,
): string {
  return `arn:${partition}:apigateway:${region}::/apis/${apiId}`;
}

export type ApiChildResource =
  | "routes"
  | "integrations"
  | "authorizers"
  | "stages";

/**
 * Builds the ARN of a resource that lives under an API (route, integration, authorizer, stage).
 */
export function formatApiChildArn(
  apiArn: string,
  resource: ApiChildResource,
  id: string,
): string {
  return `${apiArn}/${resource}/${id}`;
}

const INTEGRATION_TARGET_PREFIX = "integrations/";

/**
 * Routes reference their integration as `integrations/{IntegrationId}`.
 */
export function getIntegrationIdFromRouteTarget(
  target?: string,
): string | undefined {
  if (target?.startsWith(INTEGRATION_TARGET_PREFIX)) {
    return target.slice(INTEGRATION_TARGET_PREFIX.length);
  }
  return undefined;
}

/**
 * Lambda nodes are keyed by the unqualified function ARN, but integrations can
 * target an alias or version (`...:function:name:alias`). Point those at the
 * function itself so the edge lands on a node.
 */
function normalizeLambdaArn(arn: string): string {
  return arn.split(":").slice(0, 7).join(":");
}

// arn:{partition}:apigateway:{region}:lambda:path/2015-03-31/functions/{functionArn}/invocations
const LAMBDA_INVOCATION_URI =
  /^arn:[^:]+:apigateway:[^:]+:lambda:path\/[^/]+\/functions\/(arn:[^/]+)\/invocations$/;

// arn:{partition}:apigateway:{region}:sqs:path/{account}/{queueName}
const SQS_SERVICE_PATH_URI =
  /^arn:([^:]+):apigateway:([^:]+):sqs:path\/(\d{12})\/([^/]+)$/;

// arn:{partition}:elasticloadbalancing:{region}:{account}:listener/{app|net}/{name}/{lbId}/{listenerId}
const ELB_LISTENER_ARN =
  /^(arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:)listener\/((?:app|net)\/[^/]+\/[^/]+)\/[^/]+$/;

// https://sqs.{region}.amazonaws.com/{account}/{queueName} (or the legacy {region}.queue.amazonaws.com)
const SQS_QUEUE_URL =
  /^https:\/\/(?:sqs\.)?([a-z0-9-]+)\.(?:queue\.)?amazonaws\.com(?:\.cn)?\/(\d{12})\/([^/?#]+)/;

// arn:{partition}:states:{region}:{account}:execution:{stateMachineName}:{executionId}
const STATE_MACHINE_EXECUTION_ARN =
  /^(arn:[^:]+:states:[^:]+:[^:]+:)execution:([^:]+):[^:]+$/;

/**
 * Resolves a lambda function ARN from either a bare (possibly qualified) function
 * ARN, or an API Gateway lambda invocation URI. These are used by lambda proxy
 * integrations and lambda authorizers.
 */
export function resolveLambdaArn(uri?: string): string | undefined {
  if (uri == null) {
    return undefined;
  }
  const invocation = LAMBDA_INVOCATION_URI.exec(uri);
  const functionArn = invocation?.[1] ?? uri;
  if (/^arn:[^:]+:lambda:/.test(functionArn)) {
    return normalizeLambdaArn(functionArn);
  }
  return undefined;
}

/**
 * Translates an integration URI into the ARN of the resource it invokes.
 * HTTP URLs are left unresolved, as they don't map onto scanned resources.
 */
function resolveIntegrationUri(uri: string): string | undefined {
  const lambdaArn = resolveLambdaArn(uri);
  if (lambdaArn != null) {
    return lambdaArn;
  }

  const sqsPath = SQS_SERVICE_PATH_URI.exec(uri);
  if (sqsPath != null) {
    const [, partition, region, account, queueName] = sqsPath;
    return `arn:${partition}:sqs:${region}:${account}:${queueName}`;
  }

  // Private integrations target the listener, but load balancers are graphed by their own ARN
  const listener = ELB_LISTENER_ARN.exec(uri);
  if (listener != null) {
    return `${listener[1]}loadbalancer/${listener[2]}`;
  }

  // Any other API Gateway service URI (e.g. `...:states:action/StartExecution`) names an action rather than a resource
  if (uri.startsWith("arn:") && !/^arn:[^:]+:apigateway:/.test(uri)) {
    return uri;
  }
  return undefined;
}

/**
 * Request parameters can be static values or mapping expressions (`$request.body.queue`).
 * Only static values can be resolved to a resource.
 */
function getStaticRequestParameter(
  integration: Integration,
  key: string,
): string | undefined {
  const value = integration.RequestParameters?.[key];
  if (value == null || value.startsWith("$")) {
    return undefined;
  }
  return value;
}

/**
 * Resolves the target of an AWS service integration (`IntegrationSubtype`), which
 * identifies its target using request parameters rather than the integration URI.
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services-reference.html
 */
function resolveIntegrationSubtype(
  integration: Integration,
  location: ScanLocation,
): string | undefined {
  const [service] = integration.IntegrationSubtype?.split("-") ?? [];
  const partition = location.partition ?? DEFAULT_PARTITION;
  const { account, region } = location;

  switch (service) {
    case "SQS": {
      const queueUrl = getStaticRequestParameter(integration, "QueueUrl");
      const queue = queueUrl != null ? SQS_QUEUE_URL.exec(queueUrl) : null;
      if (queue == null) {
        return undefined;
      }
      const [, queueRegion, queueAccount, queueName] = queue;
      return `arn:${partition}:sqs:${queueRegion}:${queueAccount}:${queueName}`;
    }
    case "StepFunctions": {
      const stateMachineArn = getStaticRequestParameter(
        integration,
        "StateMachineArn",
      );
      if (stateMachineArn != null) {
        return stateMachineArn;
      }
      const executionArn = getStaticRequestParameter(
        integration,
        "ExecutionArn",
      );
      const execution =
        executionArn != null
          ? STATE_MACHINE_EXECUTION_ARN.exec(executionArn)
          : null;
      return execution != null
        ? `${execution[1]}stateMachine:${execution[2]}`
        : undefined;
    }
    case "EventBridge": {
      if (integration.RequestParameters?.EventBusName == null) {
        return `arn:${partition}:events:${region}:${account}:event-bus/default`;
      }
      const busName = getStaticRequestParameter(integration, "EventBusName");
      if (busName == null || busName.startsWith("arn:")) {
        return busName;
      }
      return `arn:${partition}:events:${region}:${account}:event-bus/${busName}`;
    }
    case "Kinesis": {
      const streamArn = getStaticRequestParameter(integration, "StreamARN");
      if (streamArn != null) {
        return streamArn;
      }
      const streamName = getStaticRequestParameter(integration, "StreamName");
      return streamName != null
        ? `arn:${partition}:kinesis:${region}:${account}:stream/${streamName}`
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Resolves the ARN of the resource an integration sends requests to, if it can
 * be determined from the scanned state.
 */
export function resolveIntegrationTarget(
  integration: Integration,
  location: ScanLocation,
): string | undefined {
  if (integration.IntegrationSubtype != null) {
    return resolveIntegrationSubtype(integration, location);
  }
  if (integration.IntegrationUri != null) {
    return resolveIntegrationUri(integration.IntegrationUri);
  }
  return undefined;
}

/**
 * Resolves the lambda function behind a lambda (`REQUEST`) authorizer. JWT
 * authorizers are evaluated by API Gateway itself, so have no target.
 */
export function resolveAuthorizerTarget(
  authorizer: Authorizer,
): string | undefined {
  if (authorizer.AuthorizerType !== "REQUEST") {
    return undefined;
  }
  return resolveLambdaArn(authorizer.AuthorizerUri);
}
