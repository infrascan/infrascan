import {
  DescribeNatGatewaysCommandInput,
  DescribeNatGatewaysCommandOutput,
  NatGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export const NatGatewayEntity: TranslatedEntity<
  BaseState<unknown>,
  State<DescribeNatGatewaysCommandOutput, DescribeNatGatewaysCommandInput>,
  WithCallContext<NatGateway, DescribeNatGatewaysCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-nat-gateway",
  provider: "aws",
  command: "DescribeNatGateways",
  category: "ec2",
  subcategory: "nat-gateway",
  nodeType: "ec2-nat-gateway",
  selector: "EC2|DescribeNatGateways|[]",

  translate(val) {
    return (
      val._result.NatGateways?.map((natgateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...natgateway,
      })) ?? []
    );
  },

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      NatGatewayEntity.selector,
      state,
    );
  },

  components: {
    $metadata(val) {
      return {
        version: NatGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.NatGatewayId!,
        label: val.NatGatewayId!,
        nodeClass: "informational",
        nodeType: NatGatewayEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: NatGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.NatGatewayId!,
        name: val.NatGatewayId!,
        category: NatGatewayEntity.category,
        subcategory: NatGatewayEntity.subcategory,
      };
    },

    tags(val) {
      return (
        val.Tags?.map((tag) => ({
          key: tag.Key!,
          val: tag.Value!,
        })) ?? []
      );
    },

    $source(val) {
      return {
        command: NatGatewayEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    network(val) {
      return {
        targetSubnets: val.SubnetId != null ? [val.SubnetId] : undefined,
        assignedAddresses: {
          ipv4: val.NatGatewayAddresses?.map((addr) => addr.PrivateIp).join(
            ", ",
          ),
        },
        publicIp: val.NatGatewayAddresses?.length
          ? {
              status: "enabled",
              address: val.NatGatewayAddresses?.map(
                (addr) => addr.PublicIp,
              ).join(", "),
            }
          : undefined,
        vpc: {
          id: val.VpcId,
        },
      };
    },
    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreateTime),
      };
    },
  },
};
