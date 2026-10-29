import type {
  DBInstance,
  DescribeDBInstancesCommandInput,
  DescribeDBInstancesCommandOutput,
} from "@aws-sdk/client-rds";
import { evaluateSelector } from "@infrascan/core";
import type {
  TranslatedEntity,
  BaseState,
  State,
  WithCallContext,
  PublicIpStatus,
} from "@infrascan/shared-types";
import { buildClusterArn } from "../arn";

export interface EngineDetails {
  version?: string;
  type?: string;
  /**
   * Cluster engine mode e.g. provisioned, serverless (v1), parallelquery, global, multimaster
   */
  mode?: string;
}

export interface AssociatedRole {
  arn?: string;
  associatedFeature?: string;
}

export interface ActivityStream {
  kmsKeyId?: string;
  streamName?: string;
}

export interface RDSState {
  engine?: EngineDetails;
  associatedRoles?: AssociatedRole[];
  activityStream?: ActivityStream;
}

export type RDSInstance = BaseState<DescribeDBInstancesCommandInput> & {
  rds: RDSState;
};

export type GraphState = RDSInstance;

export const RDSInstanceEntity: TranslatedEntity<
  RDSInstance,
  State<DescribeDBInstancesCommandOutput, DescribeDBInstancesCommandInput>,
  WithCallContext<DBInstance, DescribeDBInstancesCommandInput>
> = {
  version: "0.1.2",
  debugLabel: "rds",
  provider: "aws",
  command: "DescribeDBInstances",
  category: "rds",
  subcategory: "instance",
  nodeType: "rds-instance",
  selector: "RDS|DescribeDBInstances|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      RDSInstanceEntity.selector,
      state,
    );
  },

  translate(val) {
    return (val._result.DBInstances ?? []).map((instance) =>
      Object.assign(instance, {
        $metadata: val._metadata,
        $parameters: val._parameters,
      }),
    );
  },

  components: {
    $metadata(val) {
      return {
        version: RDSInstanceEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      // Instances which belong to a DB cluster (Aurora, Multi-AZ DB clusters) are nested under the cluster node,
      // whose ID is the cluster ARN. Standalone instances sit directly under the account-region node.
      const parent =
        val.DBClusterIdentifier != null
          ? buildClusterArn(
              val.DBClusterIdentifier,
              val.$metadata,
              val.DBInstanceArn,
            )
          : `${val.$metadata.account}-${val.$metadata.region}`;
      return {
        id: val.DBInstanceIdentifier!,
        label: val.DBName ?? val.DBInstanceIdentifier!,
        nodeType: RDSInstanceEntity.nodeType,
        nodeClass: "visual",
        parent,
      };
    },

    $source(val) {
      return {
        command: RDSInstanceEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: RDSInstanceEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      const zones = [];
      if (val.AvailabilityZone != null) {
        zones.push(val.AvailabilityZone);
      }
      if (val.SecondaryAvailabilityZone != null) {
        zones.push(val.SecondaryAvailabilityZone);
      }
      return {
        code: val.$metadata.region,
        zone: zones,
      };
    },

    resource(val) {
      return {
        id: val.DBInstanceIdentifier!,
        name: val.DBName ?? val.DBInstanceIdentifier!,
        category: RDSInstanceEntity.category,
        subcategory: RDSInstanceEntity.subcategory,
        description: val.DBInstanceClass,
      };
    },

    tags(val) {
      if (val.TagList == null) {
        return [];
      }
      return val.TagList.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    iam(val) {
      const roles = [];
      if (val.CustomIamInstanceProfile != null) {
        roles.push({
          label: "instance-profile",
          arn: val.CustomIamInstanceProfile,
        });
      }
      if (val.MonitoringRoleArn != null) {
        roles.push({
          label: "monitoring-role",
          arn: val.MonitoringRoleArn,
        });
      }
      return {
        roles,
      };
    },

    encryption(val) {
      return {
        keyId: val.KmsKeyId,
      };
    },

    network(val) {
      let hasPublicIp: PublicIpStatus | undefined = undefined;
      if (val.PubliclyAccessible != null) {
        hasPublicIp = val.PubliclyAccessible ? "enabled" : "disabled";
      }
      return {
        publicIp: {
          status: hasPublicIp,
        },
        vpc: {
          id: val.DBSubnetGroup?.VpcId,
        },
        securityGroups: val.VpcSecurityGroups?.map(
          (sg) => sg.VpcSecurityGroupId!,
        ),
        targetSubnets: val.DBSubnetGroup?.Subnets?.map(
          (subnet) => subnet.SubnetIdentifier!,
        ),
      };
    },

    rds(val) {
      return {
        engine: {
          version: val.EngineVersion,
          type: val.Engine,
        },
        associatedRoles: val.AssociatedRoles?.map((role) => ({
          arn: role.RoleArn!,
          associatedFeature: role.FeatureName!,
        })),
        activityStream: {
          streamName: val.ActivityStreamKinesisStreamName,
          kmsKeyId: val.ActivityStreamKmsKeyId,
        },
      };
    },

    dns(val) {
      return {
        domains: val.Endpoint?.Address != null ? [val.Endpoint.Address] : [],
      };
    },
  },
};
