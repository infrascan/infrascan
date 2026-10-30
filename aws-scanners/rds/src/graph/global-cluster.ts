import type {
  DescribeGlobalClustersCommandInput,
  DescribeGlobalClustersCommandOutput,
  GlobalCluster,
} from "@aws-sdk/client-rds";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import { parseRdsArn } from "../arn";
import type { RDSState } from "./instance";

export interface GlobalClusterMemberDetails {
  clusterArn: string;
  isWriter: boolean;
  readers: string[];
  synchronizationStatus?: string;
  writeForwardingStatus?: string;
}

export interface GlobalClusterDetails {
  identifier?: string;
  resourceId?: string;
  status?: string;
  databaseName?: string;
  endpoint?: string;
  storageEncrypted?: boolean;
  deletionProtection?: boolean;
  failoverStatus?: string;
  members: GlobalClusterMemberDetails[];
}

export type RDSGlobalClusterState =
  BaseState<DescribeGlobalClustersCommandInput> & {
    rds: RDSState & { globalCluster: GlobalClusterDetails };
  };

type GlobalClusterWithContext = WithCallContext<
  GlobalCluster,
  DescribeGlobalClustersCommandInput
>;

/**
 * Global clusters are returned by DescribeGlobalClusters in every region. To avoid producing the same node for every
 * scanned region, the global cluster is only emitted from the region of its writer (primary) cluster. Global clusters
 * without a writer are emitted from every region, and the graph discards the duplicates.
 */
export function getGlobalClusterHomeRegion(
  globalCluster: Pick<GlobalCluster, "GlobalClusterMembers">,
): string | undefined {
  const writer = globalCluster.GlobalClusterMembers?.find(
    (member) => member.IsWriter,
  );
  return parseRdsArn(writer?.DBClusterArn)?.region;
}

export const RDSGlobalClusterEntity: TranslatedEntity<
  RDSGlobalClusterState,
  State<
    DescribeGlobalClustersCommandOutput,
    DescribeGlobalClustersCommandInput
  >,
  GlobalClusterWithContext
> = {
  version: "0.1.0",
  debugLabel: "rds-global-cluster",
  provider: "aws",
  command: "DescribeGlobalClusters",
  category: "rds",
  subcategory: "global-cluster",
  nodeType: "rds-global-cluster",
  selector: "RDS|DescribeGlobalClusters|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      RDSGlobalClusterEntity.selector,
      state,
    );
  },

  translate(val) {
    return (val._result.GlobalClusters ?? [])
      .filter((globalCluster) => {
        if (globalCluster.GlobalClusterArn == null) {
          return false;
        }
        const homeRegion = getGlobalClusterHomeRegion(globalCluster);
        return homeRegion == null || homeRegion === val._metadata.region;
      })
      .map((globalCluster) => ({
        ...globalCluster,
        $metadata: val._metadata,
        $parameters: val._parameters,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: RDSGlobalClusterEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.GlobalClusterArn!,
        label: val.GlobalClusterIdentifier ?? val.GlobalClusterArn!,
        nodeType: RDSGlobalClusterEntity.nodeType,
        nodeClass: "visual",
        // Global clusters span regions, so they sit directly under the account
        parent: val.$metadata.account,
      };
    },

    $source(val) {
      return {
        command: RDSGlobalClusterEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: RDSGlobalClusterEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: getGlobalClusterHomeRegion(val) ?? val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.GlobalClusterArn!,
        name: val.GlobalClusterIdentifier ?? val.GlobalClusterArn!,
        category: RDSGlobalClusterEntity.category,
        subcategory: RDSGlobalClusterEntity.subcategory,
        description: val.Engine,
      };
    },

    tags(val) {
      return (val.TagList ?? []).map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    dns(val) {
      return {
        domains: val.Endpoint != null ? [val.Endpoint] : [],
      };
    },

    rds(val) {
      return {
        engine: {
          type: val.Engine,
          version: val.EngineVersion,
        },
        globalCluster: {
          identifier: val.GlobalClusterIdentifier,
          resourceId: val.GlobalClusterResourceId,
          status: val.Status,
          databaseName: val.DatabaseName,
          endpoint: val.Endpoint,
          storageEncrypted: val.StorageEncrypted,
          deletionProtection: val.DeletionProtection,
          failoverStatus: val.FailoverState?.Status,
          members: (val.GlobalClusterMembers ?? [])
            .filter((member) => member.DBClusterArn != null)
            .map((member) => ({
              clusterArn: member.DBClusterArn!,
              isWriter: member.IsWriter ?? false,
              readers: member.Readers ?? [],
              synchronizationStatus: member.SynchronizationStatus,
              writeForwardingStatus: member.GlobalWriteForwardingStatus,
            })),
        },
      };
    },
  },
};
