import type {
  DBProxyTarget,
  DescribeDBClustersCommandOutput,
  DescribeDBProxiesCommandOutput,
  DescribeDBProxyTargetsCommandInput,
  DescribeDBProxyTargetsCommandOutput,
  DescribeGlobalClustersCommandOutput,
} from "@aws-sdk/client-rds";
import { formatEdge } from "@infrascan/core";
import type {
  CommandCallMetadata,
  Connector,
  SelectedEdge,
  State,
} from "@infrascan/shared-types";
import { buildClusterArn, parseRdsArn } from "./arn";

/**
 * Key used to scope resource identifiers (which are only unique per account and region) when resolving them to ARNs.
 */
function scopedKey(
  metadata: Pick<CommandCallMetadata, "account" | "region">,
  identifier: string,
) {
  return `${metadata.account}|${metadata.region}|${identifier}`;
}

/**
 * Global clusters are returned from every region, and proxy targets can reference the same cluster more than once,
 * so edges are deduplicated on their source and target.
 */
function dedupeEdges(edges: SelectedEdge[]): SelectedEdge[] {
  const uniqueEdges = new Map<string, SelectedEdge>();
  edges.forEach((edge) => {
    const key = `${edge.source}-${edge.target}`;
    if (!uniqueEdges.has(key)) {
      uniqueEdges.set(key, edge);
    }
  });
  return Array.from(uniqueEdges.values());
}

/**
 * DB cluster -> member DB instance.
 * Instance node IDs are the DBInstanceIdentifier (see RDSInstanceEntity), cluster node IDs are the DBClusterArn.
 */
export async function getClusterMemberEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const clusterState: State<DescribeDBClustersCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "RDS",
      "DescribeDBClusters",
    );
  const edges: SelectedEdge[] = [];
  clusterState.forEach((page) => {
    (page._result.DBClusters ?? []).forEach((cluster) => {
      const clusterArn = cluster.DBClusterArn;
      if (clusterArn == null) {
        return;
      }
      (cluster.DBClusterMembers ?? []).forEach((member) => {
        if (member.DBInstanceIdentifier == null) {
          return;
        }
        const role = member.IsClusterWriter ? "Writer" : "Reader";
        edges.push(
          formatEdge(clusterArn, {
            name: `${cluster.DBClusterIdentifier ?? clusterArn} ${role}`,
            target: member.DBInstanceIdentifier,
          }),
        );
      });
    });
  });
  return dedupeEdges(edges);
}

/**
 * Resolve the node ID that a proxy target should point to:
 * - TRACKED_CLUSTER targets point to the cluster (node ID: cluster ARN)
 * - Instances or serverless endpoints tracked as part of a cluster point to that cluster, as they're represented by
 *   the cluster's own target
 * - Standalone RDS_INSTANCE targets point to the instance (node ID: instance identifier)
 */
function resolveProxyTargetNodeId(
  target: DBProxyTarget,
  resolveClusterArn: (clusterId: string) => string,
): string | undefined {
  const parsedTargetArn = parseRdsArn(target.TargetArn);
  if (target.Type === "TRACKED_CLUSTER") {
    if (parsedTargetArn?.resourceType === "cluster") {
      return target.TargetArn;
    }
    const clusterId = target.RdsResourceId ?? parsedTargetArn?.identifier;
    return clusterId != null ? resolveClusterArn(clusterId) : undefined;
  }
  if (target.TrackedClusterId != null) {
    return resolveClusterArn(target.TrackedClusterId);
  }
  if (target.Type === "RDS_INSTANCE") {
    return target.RdsResourceId ?? parsedTargetArn?.identifier;
  }
  return undefined;
}

/**
 * DB proxy -> DB cluster (TRACKED_CLUSTER targets, or instances tracked as part of a cluster)
 * DB proxy -> DB instance (standalone RDS_INSTANCE targets)
 */
export async function getProxyTargetEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const proxyTargetState: State<
    DescribeDBProxyTargetsCommandOutput,
    DescribeDBProxyTargetsCommandInput
  >[] = await connector.getGlobalStateForServiceFunction(
    "RDS",
    "DescribeDBProxyTargets",
  );
  if (proxyTargetState.length === 0) {
    return [];
  }
  const proxyState: State<DescribeDBProxiesCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "RDS",
      "DescribeDBProxies",
    );
  const clusterState: State<DescribeDBClustersCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "RDS",
      "DescribeDBClusters",
    );

  // DescribeDBProxyTargets is called by proxy name, so names need to be resolved to proxy ARNs (node IDs)
  const proxyArnsByName = new Map<string, string>();
  proxyState.forEach((page) => {
    (page._result.DBProxies ?? []).forEach((proxy) => {
      if (proxy.DBProxyName != null && proxy.DBProxyArn != null) {
        proxyArnsByName.set(
          scopedKey(page._metadata, proxy.DBProxyName),
          proxy.DBProxyArn,
        );
      }
    });
  });

  const clusterArnsById = new Map<string, string>();
  clusterState.forEach((page) => {
    (page._result.DBClusters ?? []).forEach((cluster) => {
      if (cluster.DBClusterIdentifier != null && cluster.DBClusterArn != null) {
        clusterArnsById.set(
          scopedKey(page._metadata, cluster.DBClusterIdentifier),
          cluster.DBClusterArn,
        );
      }
    });
  });

  const edges: SelectedEdge[] = [];
  proxyTargetState.forEach((page) => {
    const proxyName = page._parameters?.DBProxyName;
    const proxyArn =
      proxyName != null
        ? proxyArnsByName.get(scopedKey(page._metadata, proxyName))
        : undefined;
    if (proxyName == null || proxyArn == null) {
      return;
    }
    // Prefer the scanned cluster's ARN, falling back to building it from the proxy's partition/region/account
    const resolveClusterArn = (clusterId: string) =>
      clusterArnsById.get(scopedKey(page._metadata, clusterId)) ??
      buildClusterArn(clusterId, page._metadata, proxyArn);

    (page._result.Targets ?? []).forEach((target) => {
      const targetNodeId = resolveProxyTargetNodeId(target, resolveClusterArn);
      if (targetNodeId != null) {
        edges.push(
          formatEdge(proxyArn, {
            name: `${proxyName} Target`,
            target: targetNodeId,
          }),
        );
      }
    });
  });
  return dedupeEdges(edges);
}

/**
 * Global cluster -> member regional DB clusters
 */
export async function getGlobalClusterEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const globalClusterState: State<DescribeGlobalClustersCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "RDS",
      "DescribeGlobalClusters",
    );
  const edges: SelectedEdge[] = [];
  globalClusterState.forEach((page) => {
    (page._result.GlobalClusters ?? []).forEach((globalCluster) => {
      const globalClusterArn = globalCluster.GlobalClusterArn;
      if (globalClusterArn == null) {
        return;
      }
      (globalCluster.GlobalClusterMembers ?? []).forEach((member) => {
        if (member.DBClusterArn == null) {
          return;
        }
        const role = member.IsWriter ? "Primary" : "Secondary";
        edges.push(
          formatEdge(globalClusterArn, {
            name: `${
              globalCluster.GlobalClusterIdentifier ?? globalClusterArn
            } ${role}`,
            target: member.DBClusterArn,
          }),
        );
      });
    });
  });
  return dedupeEdges(edges);
}

export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const [clusterMemberEdges, proxyTargetEdges, globalClusterEdges] =
    await Promise.all([
      getClusterMemberEdges(connector),
      getProxyTargetEdges(connector),
      getGlobalClusterEdges(connector),
    ]);
  return [...clusterMemberEdges, ...proxyTargetEdges, ...globalClusterEdges];
}
