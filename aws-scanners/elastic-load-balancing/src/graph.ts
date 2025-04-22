import type {
  DescribeLoadBalancersCommandInput,
  DescribeLoadBalancersCommandOutput,
  LoadBalancer,
  LoadBalancerTypeEnum,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

function getPublicIpStatus(val: LoadBalancer) {
  if (val.Scheme === "internet-facing") {
    return "enabled";
  }
  if (val.Scheme === "internal") {
    return "disabled";
  }
  return undefined;
}

function getNodeType(val?: LoadBalancerTypeEnum) {
  if (val === "application") {
    return "application-load-balancer";
  }
  if (val === "network") {
    return "network-load-balancer";
  }
  return "elastic-load-balancer";
}

export type ElasticLoadBalancer =
  BaseState<DescribeLoadBalancersCommandInput> & {
    loadBalancer: {
      type?: LoadBalancerTypeEnum;
    };
  };

export const ElasticLoadBalancerEntity: TranslatedEntity<
  ElasticLoadBalancer,
  State<DescribeLoadBalancersCommandOutput, DescribeLoadBalancersCommandInput>,
  WithCallContext<LoadBalancer, DescribeLoadBalancersCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "elastic-load-balancing",
  provider: "aws",
  command: "DescribeLoadBalancers",
  category: "elastic-load-balancing",
  subcategory: "load-balancer",
  nodeType: "elastic-load-balancer",
  selector: "ElasticLoadBalancingV2|DescribeLoadBalancers|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ElasticLoadBalancerEntity.selector,
      state,
    );
  },

  translate(val) {
    return (val._result.LoadBalancers ?? []).map((loadBalancer) =>
      Object.assign(loadBalancer, {
        $metadata: val._metadata,
        $parameters: val._parameters,
      }),
    );
  },

  components: {
    $metadata(val) {
      return {
        version: ElasticLoadBalancerEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.LoadBalancerArn!,
        label: val.LoadBalancerName!,
        nodeType: getNodeType(val.Type),
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: ElasticLoadBalancerEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ElasticLoadBalancerEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZones?.map((zone) => zone.ZoneName!),
      };
    },

    resource(val) {
      return {
        id: val.LoadBalancerArn!,
        name: val.LoadBalancerName!,
        category: ElasticLoadBalancerEntity.category,
        subcategory: ElasticLoadBalancerEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt:
          val.CreatedTime != null ? new Date(val.CreatedTime) : undefined,
      };
    },

    dns(val) {
      return {
        domains: val.DNSName != null ? [val.DNSName] : [],
      };
    },

    network(val) {
      return {
        publicIp: {
          status: getPublicIpStatus(val),
        },
        securityGroups: val.SecurityGroups,
        vpc: {
          id: val.VpcId,
        },
        targetSubnets: val.AvailabilityZones?.map((zone) => zone.SubnetId!),
      };
    },

    loadBalancer(val) {
      return {
        type: val.Type,
      };
    },
  },
};
