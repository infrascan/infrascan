import {
  DescribeVpnGatewaysCommandInput,
  DescribeVpnGatewaysCommandOutput,
  VpnGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import type { GatewayAttachment } from "./internet-gateway";

export interface VpnGatewayDetails {
  state?: string;
  type?: string;
  amazonSideAsn?: number;
  attachments: GatewayAttachment[];
}

export interface VpnGatewayState
  extends BaseState<DescribeVpnGatewaysCommandInput> {
  vpnGateway?: VpnGatewayDetails;
}

export const VpnGatewayEntity: TranslatedEntity<
  VpnGatewayState,
  State<DescribeVpnGatewaysCommandOutput, DescribeVpnGatewaysCommandInput>,
  WithCallContext<VpnGateway, DescribeVpnGatewaysCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-vpn-gateway",
  provider: "aws",
  command: "DescribeVpnGateways",
  category: "ec2",
  subcategory: "vpn-gateway",
  nodeType: "ec2-vpn-gateway",
  selector: "EC2|DescribeVpnGateways|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      VpnGatewayEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.VpnGateways?.map((vpnGateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...vpnGateway,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: VpnGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.VpnGatewayId!,
        label: val.VpnGatewayId!,
        nodeClass: "informational",
        nodeType: VpnGatewayEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: VpnGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.VpnGatewayId!,
        name: val.VpnGatewayId!,
        category: VpnGatewayEntity.category,
        subcategory: VpnGatewayEntity.subcategory,
      };
    },

    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: VpnGatewayEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZone != null ? [val.AvailabilityZone] : undefined,
      };
    },

    network(val) {
      const vpcId = val.VpcAttachments?.find(
        (attachment) => attachment.State === "attached",
      )?.VpcId;
      return {
        vpc: vpcId != null ? { id: vpcId } : undefined,
      };
    },

    vpnGateway(val) {
      return {
        state: val.State,
        type: val.Type,
        amazonSideAsn: val.AmazonSideAsn,
        attachments:
          val.VpcAttachments?.map((attachment) => ({
            vpcId: attachment.VpcId,
            state: attachment.State,
          })) ?? [],
      };
    },
  },
};
