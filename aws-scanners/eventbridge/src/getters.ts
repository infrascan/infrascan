import { evaluateSelector } from "@infrascan/core";
import {
  EventBridgeClient,
  EventBridgeServiceException,
  ListTargetsByRuleCommand,
  ListTargetsByRuleCommandInput,
  ListTargetsByRuleCommandOutput,
  ListRulesCommandInput,
  ListRulesCommandOutput,
} from "@aws-sdk/client-eventbridge";
import type {
  AwsContext,
  Connector,
  GenericState,
  State,
} from "@infrascan/shared-types";
import debug from "debug";

/**
 * ListTargetsByRule needs each rule's name paired with the bus it lives on. The
 * codegen parameter resolver pairs selector results by index, which silently
 * misaligns if any rule omits `EventBusName`, so the pairs are built from the
 * ListRules state directly.
 */
export async function ListTargetsByRule(
  client: EventBridgeClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("eventbridge:ListTargetsByRule");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const listRulesState = await evaluateSelector<
    State<ListRulesCommandOutput, ListRulesCommandInput>
  >(
    context.account,
    context.region,
    "EventBridge|ListRules|[]",
    stateConnector,
  );

  const parameterQueue: ListTargetsByRuleCommandInput[] =
    listRulesState.flatMap(
      (rulesState) =>
        rulesState._result.Rules?.filter((rule) => rule.Name != null).map(
          (rule) => ({
            Rule: rule.Name!,
            EventBusName:
              rule.EventBusName ?? rulesState._parameters?.EventBusName,
          }),
        ) ?? [],
    );

  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: ListTargetsByRuleCommandInput = {
        ...parameters,
        NextToken: pagingToken,
      };
      try {
        const cmd = new ListTargetsByRuleCommand(preparedParams);
        const result: ListTargetsByRuleCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.NextToken;
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
    "ListTargetsByRule",
    state,
  );
}
