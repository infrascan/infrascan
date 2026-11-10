import type { DescribeConfigurationAggregatorsCommandOutput } from "@aws-sdk/client-config-service";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

interface AggregatesEdge {
  source: string;
  target: string;
  allAwsRegions: boolean;
  awsRegions: Set<string>;
}

/**
 * `aggregates` edges from each aggregator to every account it lists explicitly. Organization sources name no accounts,
 * so they produce no edges; the organization source is recorded on the aggregator node instead.
 */
export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const pages: Serialized<
    CallState<DescribeConfigurationAggregatorsCommandOutput, unknown>
  >[] =
    (await evaluateSelectorGlobally(
      "ConfigService|DescribeConfigurationAggregators|[]",
      connector,
    )) ?? [];
  const edges = new Map<string, AggregatesEdge>();
  for (const page of pages) {
    for (const aggregator of page._result?.ConfigurationAggregators ?? []) {
      const source = aggregator.ConfigurationAggregatorArn;
      if (source != null) {
        for (const accountSource of aggregator.AccountAggregationSources ??
          []) {
          for (const target of accountSource.AccountIds ?? []) {
            const id = `${source}-${target}`;
            const edge = edges.get(id) ?? {
              source,
              target,
              allAwsRegions: false,
              awsRegions: new Set<string>(),
            };
            edge.allAwsRegions ||= accountSource.AllAwsRegions === true;
            for (const region of accountSource.AwsRegions ?? []) {
              edge.awsRegions.add(region);
            }
            edges.set(id, edge);
          }
        }
      }
    }
  }
  return [...edges.values()].map(
    ({ source, target, allAwsRegions, awsRegions }) => ({
      source,
      target,
      metadata: {
        label: "aggregates",
        allAwsRegions,
        awsRegions: [...awsRegions].sort(),
      },
    }),
  );
}
