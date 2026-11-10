import {
  DescribeOrganizationsAccessCommand,
  DescribeStackSetCommand,
  ListStackInstancesCommand,
  ListStackSetsCommand,
  type CallAs,
  type CloudFormationClient,
  type DescribeOrganizationsAccessCommandInput,
  type DescribeStackSetCommandInput,
  type DescribeStackSetCommandOutput,
  type ListStackInstancesCommandInput,
  type ListStackSetsCommandInput,
  type ListStackSetsCommandOutput,
} from "@aws-sdk/client-cloudformation";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState, type CallState } from "./state";

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

/**
 * StackSets are listed once as the account itself and once as a delegated administrator. The delegated administrator
 * call fails in any account that is not registered as one, and that failure is recorded like any other.
 */
export const CALL_AS: CallAs[] = ["SELF", "DELEGATED_ADMIN"];

export interface StackSetReference {
  stackSetId: string;
  callAs: CallAs;
}

/**
 * The stack sets listed by `ListStackSets`, with the `CallAs` they were listed under.
 */
export async function getListedStackSets(
  connector: Connector,
  context: AwsContext,
): Promise<StackSetReference[]> {
  const pages =
    (await evaluateSelector<
      CallState<ListStackSetsCommandOutput, ListStackSetsCommandInput>
    >(
      context.account,
      context.region,
      "CloudFormation|ListStackSets|[]",
      connector,
    )) ?? [];
  const seen = new Set<string>();
  const references: StackSetReference[] = [];
  for (const page of pages) {
    const callAs = page._parameters?.CallAs ?? "SELF";
    for (const summary of page._result?.Summaries ?? []) {
      const key = `${callAs}|${summary.StackSetId}`;
      if (summary.StackSetId != null && !seen.has(key)) {
        seen.add(key);
        references.push({ stackSetId: summary.StackSetId, callAs });
      }
    }
  }
  return references;
}

export async function DescribeOrganizationsAccess(
  client: CloudFormationClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: DescribeOrganizationsAccessCommandInput) =>
      client.send(new DescribeOrganizationsAccessCommand(input)),
    { CallAs: "SELF" },
  );
  await recordState(connector, context, "DescribeOrganizationsAccess", state);
}

/**
 * Only active stack sets are listed: a deleted stack set deploys nothing.
 */
export async function ListStackSets(
  client: CloudFormationClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const callAs of CALL_AS) {
    state.push(
      ...(await call(
        context,
        (input: ListStackSetsCommandInput) =>
          client.send(new ListStackSetsCommand(input)),
        { CallAs: callAs, Status: "ACTIVE" },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListStackSets", state);
}

/**
 * The template body and parameter values are dropped before the response is recorded: the scanner records how a
 * stack set is deployed, not what it deploys.
 */
function withoutTemplate(
  output: DescribeStackSetCommandOutput,
): DescribeStackSetCommandOutput {
  if (output.StackSet == null) {
    return output;
  }
  const stackSet = { ...output.StackSet };
  delete stackSet.TemplateBody;
  delete stackSet.Parameters;
  return { ...output, StackSet: stackSet };
}

export async function DescribeStackSet(
  client: CloudFormationClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const { stackSetId, callAs } of await getListedStackSets(
    connector,
    context,
  )) {
    state.push(
      ...(await call(
        context,
        async (input: DescribeStackSetCommandInput) =>
          withoutTemplate(
            await client.send(new DescribeStackSetCommand(input)),
          ),
        { StackSetName: stackSetId, CallAs: callAs },
      )),
    );
  }
  await recordState(connector, context, "DescribeStackSet", state);
}

export async function ListStackInstances(
  client: CloudFormationClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const { stackSetId, callAs } of await getListedStackSets(
    connector,
    context,
  )) {
    state.push(
      ...(await call(
        context,
        (input: ListStackInstancesCommandInput) =>
          client.send(new ListStackInstancesCommand(input)),
        { StackSetName: stackSetId, CallAs: callAs },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListStackInstances", state);
}
