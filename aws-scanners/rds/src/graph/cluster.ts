import type {
  DBCluster,
  DBSubnetGroup,
  DescribeDBClustersCommandInput,
  DescribeDBClustersCommandOutput,
  DescribeDBSubnetGroupsCommandInput,
  DescribeDBSubnetGroupsCommandOutput,
} from "@aws-sdk/client-rds";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  PublicIpStatus,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import type { RDSState } from "./instance";

/**
 * - `aurora`: Aurora DB cluster (provisioned, serverless v1/v2, global member etc.)
 * - `multi-az`: Non-Aurora Multi-AZ DB cluster (one writer and two readable standbys)
 * - `other`: Any other cluster returned by the RDS API (e.g. Neptune, DocumentDB)
 */
export type ClusterType = "aurora" | "multi-az" | "other";

export interface ClusterMember {
  instanceId: string;
  isWriter: boolean;
  promotionTier?: number;
}

export interface ClusterEndpoints {
  writer?: string;
  reader?: string;
  custom: string[];
  port?: number;
}

export interface ServerlessV2Scaling {
  minCapacity?: number;
  maxCapacity?: number;
  secondsUntilAutoPause?: number;
}

export interface ServerlessV1Scaling extends ServerlessV2Scaling {
  autoPause?: boolean;
  timeoutAction?: string;
  secondsBeforeTimeout?: number;
}

export interface ClusterScaling {
  serverlessV2?: ServerlessV2Scaling;
  serverlessV1?: ServerlessV1Scaling;
}

export interface ClusterStorage {
  encrypted?: boolean;
  type?: string;
  allocatedGiB?: number;
  iops?: number;
}

export interface ManagedSecret {
  secretArn?: string;
  status?: string;
  kmsKeyId?: string;
}

export interface ClusterDetails {
  identifier?: string;
  resourceId?: string;
  type: ClusterType;
  status?: string;
  instanceClass?: string;
  databaseName?: string;
  endpoints: ClusterEndpoints;
  members: ClusterMember[];
  multiAZ?: boolean;
  storage: ClusterStorage;
  scaling?: ClusterScaling;
  masterUserSecret?: ManagedSecret;
  iamDatabaseAuthenticationEnabled?: boolean;
  backupRetentionPeriod?: number;
  deletionProtection?: boolean;
  globalClusterIdentifier?: string;
  subnetGroupName?: string;
}

export type RDSClusterState = BaseState<DescribeDBClustersCommandInput> & {
  rds: RDSState & { cluster: ClusterDetails };
};

type ClusterPage = Serialized<
  State<DescribeDBClustersCommandOutput, DescribeDBClustersCommandInput>
>;
type SubnetGroupPage = Serialized<
  State<DescribeDBSubnetGroupsCommandOutput, DescribeDBSubnetGroupsCommandInput>
>;

type ClusterPageWithSubnetGroups = State<
  DescribeDBClustersCommandOutput,
  DescribeDBClustersCommandInput
> & {
  _subnetGroups: Record<string, DBSubnetGroup>;
};

type ClusterWithContext = WithCallContext<
  DBCluster,
  DescribeDBClustersCommandInput
> & {
  ResolvedSubnetGroup?: DBSubnetGroup;
};

export function getClusterType(
  cluster: Pick<DBCluster, "Engine" | "DBClusterInstanceClass">,
): ClusterType {
  if (cluster.Engine?.startsWith("aurora")) {
    return "aurora";
  }
  if (cluster.DBClusterInstanceClass != null) {
    return "multi-az";
  }
  return "other";
}

export const RDSClusterEntity: TranslatedEntity<
  RDSClusterState,
  ClusterPageWithSubnetGroups,
  ClusterWithContext
> = {
  version: "0.1.0",
  debugLabel: "rds-cluster",
  provider: "aws",
  command: "DescribeDBClusters",
  category: "rds",
  subcategory: "cluster",
  nodeType: "rds-cluster",
  selector: "RDS|DescribeDBClusters|[]",

  async getState(state, context) {
    const clusterPages = await evaluateSelector<ClusterPage>(
      context.account,
      context.region,
      RDSClusterEntity.selector,
      state,
    );
    // DBCluster.DBSubnetGroup is only the subnet group's name, so the VPC and subnets are resolved from DescribeDBSubnetGroups
    const subnetGroupPages = await evaluateSelector<SubnetGroupPage>(
      context.account,
      context.region,
      "RDS|DescribeDBSubnetGroups|[]",
      state,
    );
    const subnetGroups: Record<string, Serialized<DBSubnetGroup>> = {};
    for (const page of subnetGroupPages) {
      for (const subnetGroup of page._result.DBSubnetGroups ?? []) {
        if (subnetGroup.DBSubnetGroupName != null) {
          subnetGroups[subnetGroup.DBSubnetGroupName] = subnetGroup;
        }
      }
    }
    return clusterPages.map((page) => ({
      ...page,
      _subnetGroups: subnetGroups,
    }));
  },

  translate(val) {
    return (val._result.DBClusters ?? [])
      .filter((cluster) => cluster.DBClusterArn != null)
      .map((cluster) => ({
        ...cluster,
        ResolvedSubnetGroup:
          cluster.DBSubnetGroup != null
            ? val._subnetGroups[cluster.DBSubnetGroup]
            : undefined,
        $metadata: val._metadata,
        $parameters: val._parameters,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: RDSClusterEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.DBClusterArn!,
        label: val.DBClusterIdentifier ?? val.DBClusterArn!,
        nodeType: RDSClusterEntity.nodeType,
        nodeClass: "visual",
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: RDSClusterEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: RDSClusterEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZones ?? [],
      };
    },

    resource(val) {
      return {
        id: val.DBClusterArn!,
        name: val.DBClusterIdentifier ?? val.DBClusterArn!,
        category: RDSClusterEntity.category,
        subcategory: RDSClusterEntity.subcategory,
        description: val.DBClusterInstanceClass ?? val.Engine,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.ClusterCreateTime),
      };
    },

    tags(val) {
      return (val.TagList ?? []).map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    iam(val) {
      const roles = [];
      if (val.MonitoringRoleArn != null) {
        roles.push({
          label: "monitoring-role",
          arn: val.MonitoringRoleArn,
        });
      }
      return { roles };
    },

    encryption(val) {
      return {
        keyId: val.KmsKeyId,
      };
    },

    network(val) {
      let hasPublicIp: PublicIpStatus | undefined;
      if (val.PubliclyAccessible != null) {
        hasPublicIp = val.PubliclyAccessible ? "enabled" : "disabled";
      }
      return {
        publicIp: {
          status: hasPublicIp,
        },
        vpc: {
          id: val.ResolvedSubnetGroup?.VpcId,
        },
        securityGroups: (val.VpcSecurityGroups ?? [])
          .map((sg) => sg.VpcSecurityGroupId)
          .filter((sgId): sgId is string => sgId != null),
        targetSubnets: (val.ResolvedSubnetGroup?.Subnets ?? [])
          .map((subnet) => subnet.SubnetIdentifier)
          .filter((subnetId): subnetId is string => subnetId != null),
      };
    },

    dns(val) {
      const domains = [
        val.Endpoint,
        val.ReaderEndpoint,
        ...(val.CustomEndpoints ?? []),
      ];
      return {
        domains: domains.filter((domain): domain is string => domain != null),
      };
    },

    rds(val) {
      let scaling: ClusterScaling | undefined;
      if (
        val.ServerlessV2ScalingConfiguration != null ||
        val.ScalingConfigurationInfo != null
      ) {
        scaling = {};
        if (val.ServerlessV2ScalingConfiguration != null) {
          scaling.serverlessV2 = {
            minCapacity: val.ServerlessV2ScalingConfiguration.MinCapacity,
            maxCapacity: val.ServerlessV2ScalingConfiguration.MaxCapacity,
            secondsUntilAutoPause:
              val.ServerlessV2ScalingConfiguration.SecondsUntilAutoPause,
          };
        }
        if (val.ScalingConfigurationInfo != null) {
          scaling.serverlessV1 = {
            minCapacity: val.ScalingConfigurationInfo.MinCapacity,
            maxCapacity: val.ScalingConfigurationInfo.MaxCapacity,
            autoPause: val.ScalingConfigurationInfo.AutoPause,
            secondsUntilAutoPause:
              val.ScalingConfigurationInfo.SecondsUntilAutoPause,
            timeoutAction: val.ScalingConfigurationInfo.TimeoutAction,
            secondsBeforeTimeout:
              val.ScalingConfigurationInfo.SecondsBeforeTimeout,
          };
        }
      }

      return {
        engine: {
          type: val.Engine,
          version: val.EngineVersion,
          mode: val.EngineMode,
        },
        associatedRoles: val.AssociatedRoles?.map((role) => ({
          arn: role.RoleArn,
          associatedFeature: role.FeatureName,
        })),
        activityStream: {
          streamName: val.ActivityStreamKinesisStreamName,
          kmsKeyId: val.ActivityStreamKmsKeyId,
        },
        cluster: {
          identifier: val.DBClusterIdentifier,
          resourceId: val.DbClusterResourceId,
          type: getClusterType(val),
          status: val.Status,
          instanceClass: val.DBClusterInstanceClass,
          databaseName: val.DatabaseName,
          endpoints: {
            writer: val.Endpoint,
            reader: val.ReaderEndpoint,
            custom: val.CustomEndpoints ?? [],
            port: val.Port,
          },
          members: (val.DBClusterMembers ?? [])
            .filter((member) => member.DBInstanceIdentifier != null)
            .map((member) => ({
              instanceId: member.DBInstanceIdentifier!,
              isWriter: member.IsClusterWriter ?? false,
              promotionTier: member.PromotionTier,
            })),
          multiAZ: val.MultiAZ,
          storage: {
            encrypted: val.StorageEncrypted,
            type: val.StorageType,
            allocatedGiB: val.AllocatedStorage,
            iops: val.Iops,
          },
          scaling,
          masterUserSecret:
            val.MasterUserSecret != null
              ? {
                  secretArn: val.MasterUserSecret.SecretArn,
                  status: val.MasterUserSecret.SecretStatus,
                  kmsKeyId: val.MasterUserSecret.KmsKeyId,
                }
              : undefined,
          iamDatabaseAuthenticationEnabled:
            val.IAMDatabaseAuthenticationEnabled,
          backupRetentionPeriod: val.BackupRetentionPeriod,
          deletionProtection: val.DeletionProtection,
          globalClusterIdentifier: val.GlobalClusterIdentifier,
          subnetGroupName: val.DBSubnetGroup,
        },
      };
    },
  },
};
