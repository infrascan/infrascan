import type {
  DescribeStackSetCommandInput,
  DescribeStackSetCommandOutput,
  ListStackInstancesCommandInput,
  ListStackInstancesCommandOutput,
} from "@aws-sdk/client-cloudformation";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

const ACCOUNT_ID = /^\d{12}$/;

async function getGlobalState<O, I = unknown>(
  connector: Connector,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  return (
    (await evaluateSelectorGlobally(
      `CloudFormation|${functionName}|[]`,
      connector,
    )) ?? []
  );
}

/**
 * One `deploys-to` edge from each stack set to each account it has stack instances in, with every region and OU id
 * those instances were reported under. A stack set seen by both its owner and a delegated administrator is merged
 * into the same edge, as both report the same ARN.
 */
export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  // Stack instances are listed by stack set id; the node is keyed by ARN.
  const arns = new Map<string, string>();
  for (const entry of await getGlobalState<
    DescribeStackSetCommandOutput,
    DescribeStackSetCommandInput
  >(connector, "DescribeStackSet")) {
    const arn = entry._result?.StackSet?.StackSetARN;
    if (arn != null) {
      const { account, region } = entry._metadata;
      arns.set(
        `${account}|${region}|${entry._parameters?.CallAs ?? "SELF"}|${
          entry._parameters?.StackSetName
        }`,
        arn,
      );
    }
  }

  const edges = new Map<
    string,
    {
      source: string;
      target: string;
      regions: Set<string>;
      organizationalUnitIds: Set<string>;
    }
  >();
  for (const page of await getGlobalState<
    ListStackInstancesCommandOutput,
    ListStackInstancesCommandInput
  >(connector, "ListStackInstances")) {
    const { account, region } = page._metadata;
    const source = arns.get(
      `${account}|${region}|${page._parameters?.CallAs ?? "SELF"}|${
        page._parameters?.StackSetName
      }`,
    );
    if (source != null) {
      for (const instance of page._result?.Summaries ?? []) {
        const target = instance.Account;
        if (target != null && ACCOUNT_ID.test(target)) {
          const key = `${source}-${target}`;
          const edge = edges.get(key) ?? {
            source,
            target,
            regions: new Set(),
            organizationalUnitIds: new Set(),
          };
          if (instance.Region != null) {
            edge.regions.add(instance.Region);
          }
          if (instance.OrganizationalUnitId != null) {
            edge.organizationalUnitIds.add(instance.OrganizationalUnitId);
          }
          edges.set(key, edge);
        }
      }
    }
  }

  return [...edges.values()].map(
    ({ source, target, regions, organizationalUnitIds }) => ({
      source,
      target,
      metadata: {
        label: "deploys-to",
        regions: [...regions].sort(),
        organizationalUnitIds: [...organizationalUnitIds].sort(),
      },
    }),
  );
}
