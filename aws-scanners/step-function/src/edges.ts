import type { DescribeStateMachineCommandOutput } from "@aws-sdk/client-sfn";
import {
  evaluateSelectorGlobally,
  formatEdge,
  formatS3NodeId,
} from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  SelectedEdgeTarget,
  State,
} from "@infrascan/shared-types";
import debug from "debug";

const edgesDebug = debug("sfn:edges");

type Parameters = Record<string, unknown>;

interface AslState {
  Type?: string;
  Resource?: string;
  // JSONPath states use Parameters, JSONata states use Arguments
  Parameters?: Parameters;
  Arguments?: Parameters | string;
  Branches?: { States?: Record<string, AslState> }[];
  Iterator?: { States?: Record<string, AslState> };
  ItemProcessor?: { States?: Record<string, AslState> };
}

interface AslDefinition {
  States?: Record<string, AslState>;
}

/**
 * Location of the state machine, used to resolve resource names and partial ARNs
 * into fully qualified ARNs.
 */
interface ArnContext {
  partition: string;
  region: string;
  account: string;
}

type TargetResolver = (params: Parameters, context: ArnContext) => string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Returns the static string value for a parameter. Dynamic values (JSONPath keys ending in `.$`
 * are never read as they have a different key, JSONata `{% ... %}` expressions are skipped)
 * resolve to undefined, as they can't be known until execution.
 */
function getStaticString(params: Parameters, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("{%") && trimmed.endsWith("%}")) {
    return undefined;
  }
  return value;
}

/**
 * Splits an ARN into its components, returns undefined if the value isn't an ARN.
 * Resource is everything after the 5th colon, so may itself contain colons.
 */
function parseArn(arn: string) {
  const parts = arn.split(":");
  if (parts.length < 6 || parts[0] !== "arn") {
    return undefined;
  }
  return {
    partition: parts[1],
    service: parts[2],
    region: parts[3],
    account: parts[4],
    resource: parts.slice(5).join(":"),
  };
}

// Accepts function names, partial ARNs (`123456789012:function:name`) and full ARNs,
// with or without a version/alias qualifier, and returns the unqualified function ARN.
function resolveLambdaArn(
  functionName: string,
  context: ArnContext,
): string | undefined {
  const parsedArn = parseArn(functionName);
  if (parsedArn != null) {
    if (parsedArn.service !== "lambda") {
      return undefined;
    }
    const [resourceType, name] = parsedArn.resource.split(":");
    if (resourceType !== "function" || !name) {
      return undefined;
    }
    return `arn:${parsedArn.partition}:lambda:${parsedArn.region}:${parsedArn.account}:function:${name}`;
  }
  const parts = functionName.split(":");
  let { account } = context;
  let name: string | undefined;
  if (parts.length >= 3 && parts[1] === "function") {
    [account, , name] = parts;
  } else if (parts.length <= 2) {
    [name] = parts;
  }
  if (!name) {
    return undefined;
  }
  return `arn:${context.partition}:lambda:${context.region}:${account}:function:${name}`;
}

function resolveSnsTopicArn(topicArn: string): string | undefined {
  return parseArn(topicArn)?.service === "sns" ? topicArn : undefined;
}

// Queue URLs take the form https://sqs.<region>.amazonaws.com/<account>/<name>, or the legacy
// https://<region>.queue.amazonaws.com/<account>/<name>. The SQS scanner uses the queue ARN as the node id.
function resolveSqsQueueArn(
  queueUrl: string,
  context: ArnContext,
): string | undefined {
  if (parseArn(queueUrl)?.service === "sqs") {
    return queueUrl;
  }
  let url: URL;
  try {
    url = new URL(queueUrl);
  } catch {
    return undefined;
  }
  const [account, name] = url.pathname.split("/").filter(Boolean);
  if (!account || !name) {
    return undefined;
  }
  const { hostname } = url;
  let { region } = context;
  const sqsHostMatch = /^sqs\.([a-z0-9-]+)\./.exec(hostname);
  const legacyHostMatch = /^([a-z0-9-]+)\.queue\./.exec(hostname);
  if (sqsHostMatch != null) {
    [, region] = sqsHostMatch;
  } else if (legacyHostMatch != null) {
    [, region] = legacyHostMatch;
  } else if (hostname === "queue.amazonaws.com") {
    region = "us-east-1";
  }
  return `arn:${context.partition}:sqs:${region}:${account}:${name}`;
}

function resolveDynamoDbTableArn(
  tableName: string,
  context: ArnContext,
): string | undefined {
  const parsedArn = parseArn(tableName);
  if (parsedArn != null) {
    return parsedArn.service === "dynamodb" ? tableName : undefined;
  }
  return `arn:${context.partition}:dynamodb:${context.region}:${context.account}:table/${tableName}`;
}

function resolveEcsClusterArn(
  cluster: string,
  context: ArnContext,
): string | undefined {
  const parsedArn = parseArn(cluster);
  if (parsedArn != null) {
    return parsedArn.service === "ecs" ? cluster : undefined;
  }
  return `arn:${context.partition}:ecs:${context.region}:${context.account}:cluster/${cluster}`;
}

// Strips version and alias qualifiers from state machine ARNs
function resolveStateMachineArn(stateMachineArn: string): string | undefined {
  const parsedArn = parseArn(stateMachineArn);
  if (parsedArn?.service !== "states") {
    return undefined;
  }
  const [resourceType, name] = parsedArn.resource.split(":");
  if (resourceType !== "stateMachine" || !name) {
    return undefined;
  }
  return `arn:${parsedArn.partition}:states:${parsedArn.region}:${parsedArn.account}:stateMachine:${name}`;
}

function resolveEventBusArn(
  eventBusName: string,
  context: ArnContext,
): string | undefined {
  const parsedArn = parseArn(eventBusName);
  if (parsedArn != null) {
    return parsedArn.service === "events" ? eventBusName : undefined;
  }
  return `arn:${context.partition}:events:${context.region}:${context.account}:event-bus/${eventBusName}`;
}

function resolveKinesisStreamArn(
  params: Parameters,
  context: ArnContext,
): string | undefined {
  const streamArn = getStaticString(params, "StreamARN");
  if (streamArn != null) {
    return parseArn(streamArn)?.service === "kinesis" ? streamArn : undefined;
  }
  const streamName = getStaticString(params, "StreamName");
  if (streamName == null) {
    return undefined;
  }
  return `arn:${context.partition}:kinesis:${context.region}:${context.account}:stream/${streamName}`;
}

function fromParameter(
  key: string,
  resolve: (value: string, context: ArnContext) => string | undefined,
): TargetResolver {
  return (params, context) => {
    const value = getStaticString(params, key);
    const resolved = value != null ? resolve(value, context) : undefined;
    return resolved != null ? [resolved] : [];
  };
}

function resolveEventBridgeTargets(
  params: Parameters,
  context: ArnContext,
): string[] {
  const entries = params.Entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    // Entries without a bus name are sent to the account's default bus
    const hasEventBusName =
      "EventBusName" in entry || "EventBusName.$" in entry;
    const eventBusName = hasEventBusName
      ? getStaticString(entry, "EventBusName")
      : "default";
    const resolved =
      eventBusName != null
        ? resolveEventBusArn(eventBusName, context)
        : undefined;
    return resolved != null ? [resolved] : [];
  });
}

function resolveEcsTargets(params: Parameters, context: ArnContext): string[] {
  // RunTask uses the default cluster when one isn't specified
  const hasCluster = "Cluster" in params || "Cluster.$" in params;
  const cluster = hasCluster ? getStaticString(params, "Cluster") : "default";
  const resolved =
    cluster != null ? resolveEcsClusterArn(cluster, context) : undefined;
  return resolved != null ? [resolved] : [];
}

const lambdaResolver = fromParameter("FunctionName", resolveLambdaArn);
const snsResolver = fromParameter("TopicArn", resolveSnsTopicArn);
const sqsResolver = fromParameter("QueueUrl", resolveSqsQueueArn);
const dynamoDbResolver = fromParameter("TableName", resolveDynamoDbTableArn);
const stateMachineResolver = fromParameter(
  "StateMachineArn",
  resolveStateMachineArn,
);

/**
 * Optimized service integrations, keyed by the resource suffix after `arn:<partition>:states:::`
 * with any integration pattern suffix removed.
 */
const OptimizedIntegrations: Record<string, TargetResolver> = {
  "lambda:invoke": lambdaResolver,
  "sns:publish": snsResolver,
  "sqs:sendMessage": sqsResolver,
  "dynamodb:getItem": dynamoDbResolver,
  "dynamodb:putItem": dynamoDbResolver,
  "dynamodb:updateItem": dynamoDbResolver,
  "dynamodb:deleteItem": dynamoDbResolver,
  "ecs:runTask": resolveEcsTargets,
  "states:startExecution": stateMachineResolver,
  "events:putEvents": resolveEventBridgeTargets,
};

/**
 * AWS SDK integrations, keyed by the SDK service name. Only services which are scanned, and
 * which identify their target resource via a known parameter, are mapped.
 */
const SdkIntegrations: Record<string, TargetResolver> = {
  lambda: lambdaResolver,
  sns: snsResolver,
  sqs: sqsResolver,
  dynamodb: dynamoDbResolver,
  sfn: stateMachineResolver,
  ecs: fromParameter("Cluster", resolveEcsClusterArn),
  eventbridge: resolveEventBridgeTargets,
  s3: fromParameter("Bucket", (bucket) => formatS3NodeId(bucket)),
  kinesis: (params, context) => {
    const resolved = resolveKinesisStreamArn(params, context);
    return resolved != null ? [resolved] : [];
  },
};

const IntegrationPatternSuffix = /\.(sync(:2)?|waitForTaskToken)$/;

function resolveTaskTargets(state: AslState, context: ArnContext): string[] {
  const { Resource: resource } = state;
  if (typeof resource !== "string") {
    return [];
  }

  // Legacy form, the Lambda function ARN is used directly as the resource
  if (parseArn(resource)?.service === "lambda") {
    const lambdaArn = resolveLambdaArn(resource, context);
    return lambdaArn != null ? [lambdaArn] : [];
  }

  const integrationMatch = /^arn:[^:]+:states:::(.+)$/.exec(resource);
  if (integrationMatch == null) {
    return [];
  }
  const integration = integrationMatch[1].replace(IntegrationPatternSuffix, "");
  const params = state.Arguments ?? state.Parameters;
  // JSONata states may provide Arguments as a single expression
  if (!isRecord(params)) {
    return [];
  }

  if (integration.startsWith("aws-sdk:")) {
    const [, service] = integration.split(":");
    const resolver = SdkIntegrations[service];
    return resolver != null ? resolver(params, context) : [];
  }

  const resolver = OptimizedIntegrations[integration];
  return resolver != null ? resolver(params, context) : [];
}

// Walks every state in the machine, including those nested in Parallel branches and Map processors
function collectTaskStates(
  states: Record<string, AslState> | undefined,
): [string, AslState][] {
  if (!isRecord(states)) {
    return [];
  }
  return Object.entries(states).flatMap(([stateName, state]) => {
    if (state == null || typeof state !== "object") {
      return [];
    }
    if (state.Type === "Task") {
      return [[stateName, state] as [string, AslState]];
    }
    const nestedStates = [
      ...(Array.isArray(state.Branches)
        ? state.Branches.map((branch) => branch?.States)
        : []),
      state.Iterator?.States,
      state.ItemProcessor?.States,
    ];
    return nestedStates.flatMap((nested) => collectTaskStates(nested));
  });
}

function parseDefinition(
  stateMachineArn: string,
  definition: string,
): AslDefinition | undefined {
  try {
    const parsed = JSON.parse(definition);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    edgesDebug(`Failed to parse definition for ${stateMachineArn}`);
    return undefined;
  }
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const DescribeStateMachineState: State<DescribeStateMachineCommandOutput>[] =
    await evaluateSelectorGlobally(
      "SFN|DescribeStateMachine|[]",
      stateConnector,
    );

  const edges: SelectedEdge[] = [];
  const seenEdges = new Set<string>();
  for (const stateMachineState of DescribeStateMachineState) {
    const source = stateMachineState._result?.stateMachineArn;
    const definition = stateMachineState._result?.definition;
    if (!source || typeof definition !== "string") {
      continue; // eslint-disable-line no-continue
    }
    const parsedDefinition = parseDefinition(source, definition);
    if (parsedDefinition == null) {
      continue; // eslint-disable-line no-continue
    }

    // Prefer the state machine's own ARN for context to support cross account scans
    const sourceArn = parseArn(source);
    const context: ArnContext = {
      partition: sourceArn?.partition || "aws",
      region: sourceArn?.region || stateMachineState._metadata?.region,
      account: sourceArn?.account || stateMachineState._metadata?.account,
    };

    for (const [stateName, state] of collectTaskStates(
      parsedDefinition.States,
    )) {
      for (const target of resolveTaskTargets(state, context)) {
        const edgeKey = `${source}|${target}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          const edgeTarget: SelectedEdgeTarget = {
            name: `${stateName} Invocation`,
            target,
          };
          edges.push(formatEdge(source, edgeTarget));
        }
      }
    }
  }
  edgesDebug(
    `Evaluated SFN|DescribeStateMachine|[]: ${edges.length} Edges found`,
  );
  return edges;
}
