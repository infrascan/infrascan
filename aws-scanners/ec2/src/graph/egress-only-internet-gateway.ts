import {
  DescribeEgressOnlyInternetGatewaysCommandInput,
  DescribeEgressOnlyInternetGatewaysCommandOutput,
  EgressOnlyInternetGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import type { GatewayAttachment } from "./internet-gateway";

export interface EgressOnlyInternetGatewayDetails {
  attachments: GatewayAttachment[];
}

export interface EgressOnlyInternetGatewayState
  extends BaseState<DescribeEgressOnlyInternetGatewaysCommandInput> {
  egressOnlyInternetGateway?: EgressOnlyInternetGatewayDetails;
}

export const EgressOnlyInternetGatewayEntity: TranslatedEntity<
  EgressOnlyInternetGatewayState,
  State<
    DescribeEgressOnlyInternetGatewaysCommandOutput,
    DescribeEgressOnlyInternetGatewaysCommandInput
  >,
  WithCallContext<
    EgressOnlyInternetGateway,
    DescribeEgressOnlyInternetGatewaysCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-egress-only-internet-gateway",
  provider: "aws",
  command: "DescribeEgressOnlyInternetGateways",
  category: "ec2",
  subcategory: "egress-only-internet-gateway",
  nodeType: "ec2-egress-only-internet-gateway",
  selector: "EC2|DescribeEgressOnlyInternetGateways|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      EgressOnlyInternetGatewayEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.EgressOnlyInternetGateways?.map((gateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...gateway,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: EgressOnlyInternetGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.EgressOnlyInternetGatewayId!,
        label: val.EgressOnlyInternetGatewayId!,
        nodeClass: "informational",
        nodeType: EgressOnlyInternetGatewayEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: EgressOnlyInternetGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.EgressOnlyInternetGatewayId!,
        name: val.EgressOnlyInternetGatewayId!,
        category: EgressOnlyInternetGatewayEntity.category,
        subcategory: EgressOnlyInternetGatewayEntity.subcategory,
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
        command: EgressOnlyInternetGatewayEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    network(val) {
      const vpcId = val.Attachments?.[0]?.VpcId;
      return {
        vpc: vpcId != null ? { id: vpcId } : undefined,
      };
    },

    egressOnlyInternetGateway(val) {
      return {
        attachments:
          val.Attachments?.map((attachment) => ({
            vpcId: attachment.VpcId,
            state: attachment.State,
          })) ?? [],
      };
    },
  },
};
