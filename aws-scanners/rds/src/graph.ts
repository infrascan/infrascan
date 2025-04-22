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

export interface EngineDetails {
  version?: string;
  type?: string;
}

export interface AssociatedRole {
  arn?: string;
  associatedFeature?: string;
}

export interface ActivityStream {
  kmsKeyId?: string;
  streamName?: string;
}

export type RDSInstance = BaseState<DescribeDBInstancesCommandInput> & {
  rds: {
    engine?: EngineDetails;
    associatedRoles?: AssociatedRole[];
    activityStream?: ActivityStream;
  };
};

export const RDSInstanceEntity: TranslatedEntity<
  RDSInstance,
  State<DescribeDBInstancesCommandOutput, DescribeDBInstancesCommandInput>,
  WithCallContext<DBInstance, DescribeDBInstancesCommandInput>
> = {
  version: "0.1.0",
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
      return {
        id: val.DBInstanceIdentifier!,
        label: val.DBName!,
        nodeType: RDSInstanceEntity.nodeType,
        parent:
          val.DBClusterIdentifier ??
          `${val.$metadata.account}-${val.$metadata.region}`,
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
        name: val.DBName!,
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
