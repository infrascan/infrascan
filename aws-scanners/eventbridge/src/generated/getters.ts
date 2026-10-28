import {
  evaluateSelectorGlobally,
  resolveFunctionCallParameters,
} from "@infrascan/core";
import {
  EventBridgeClient,
  EventBridgeServiceException,
} from "@aws-sdk/client-eventbridge";
import {
  ListEventBusesCommand,
  ListEventBusesCommandInput,
  ListEventBusesCommandOutput,
} from "@aws-sdk/client-eventbridge";
import {
  DescribeEventBusCommand,
  DescribeEventBusCommandInput,
  DescribeEventBusCommandOutput,
} from "@aws-sdk/client-eventbridge";
import {
  ListRulesCommand,
  ListRulesCommandInput,
  ListRulesCommandOutput,
} from "@aws-sdk/client-eventbridge";
import {
  ListApiDestinationsCommand,
  ListApiDestinationsCommandInput,
  ListApiDestinationsCommandOutput,
} from "@aws-sdk/client-eventbridge";
import {
  ListConnectionsCommand,
  ListConnectionsCommandInput,
  ListConnectionsCommandOutput,
} from "@aws-sdk/client-eventbridge";
import type {
  Connector,
  GenericState,
  AwsContext,
  EntityRoleData,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListEventBuses(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:ListEventBuses");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListEventBusesCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new ListEventBusesCommand(preparedParams);
      const result: ListEventBusesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof EventBridgeServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EventBridge",
    "ListEventBuses",
    state,
  );
}
export async function DescribeEventBus(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:DescribeEventBus");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "Name",
      Selector: "EventBridge|ListEventBuses|[]._result.EventBuses[].Name",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeEventBusCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeEventBusCommandInput = parameters;
    try {
      const cmd = new DescribeEventBusCommand(preparedParams);
      const result: DescribeEventBusCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof EventBridgeServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EventBridge",
    "DescribeEventBus",
    state,
  );
}

export async function ListRules(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:ListRules");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "EventBusName",
      Selector: "EventBridge|ListEventBuses|[]._result.EventBuses[].Name",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListRulesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: ListRulesCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new ListRulesCommand(preparedParams);
        const result: ListRulesCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result["NextToken"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof EventBridgeServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EventBridge",
    "ListRules",
    state,
  );
}

export async function ListApiDestinations(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:ListApiDestinations");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListApiDestinationsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new ListApiDestinationsCommand(preparedParams);
      const result: ListApiDestinationsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof EventBridgeServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EventBridge",
    "ListApiDestinations",
    state,
  );
}

export async function ListConnections(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:ListConnections");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListConnectionsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new ListConnectionsCommand(preparedParams);
      const result: ListConnectionsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof EventBridgeServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EventBridge",
    "ListConnections",
    state,
  );
}

export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  const iamDebug = debug("eventbridge:iam");
  iamDebug("Pulling IAM roles from state");
  const state: EntityRoleData[] = [];
  const ListRulesRoleState = (await evaluateSelectorGlobally(
    "EventBridge|ListRules|[]._result.Rules[?RoleArn] | [].{roleArn:RoleArn,executor:Arn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...ListRulesRoleState);
  return state;
}
