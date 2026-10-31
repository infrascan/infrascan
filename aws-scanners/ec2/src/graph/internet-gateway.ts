import {
  DescribeInternetGatewaysCommandInput,
  DescribeInternetGatewaysCommandOutput,
  InternetGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface GatewayAttachment {
  vpcId?: string;
  state?: string;
}

export interface InternetGatewayDetails {
  ownerId?: string;
  attachments: GatewayAttachment[];
}

export interface InternetGatewayState
  extends BaseState<DescribeInternetGatewaysCommandInput> {
  internetGateway?: InternetGatewayDetails;
}

export const InternetGatewayEntity: TranslatedEntity<
  InternetGatewayState,
  State<
    DescribeInternetGatewaysCommandOutput,
    DescribeInternetGatewaysCommandInput
  >,
  WithCallContext<InternetGateway, DescribeInternetGatewaysCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-internet-gateway",
  provider: "aws",
  command: "DescribeInternetGateways",
  category: "ec2",
  subcategory: "internet-gateway",
  nodeType: "ec2-internet-gateway",
  selector: "EC2|DescribeInternetGateways|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      InternetGatewayEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.InternetGateways?.map((internetGateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...internetGateway,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: InternetGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.InternetGatewayId!,
        label: val.InternetGatewayId!,
        nodeClass: "informational",
        nodeType: InternetGatewayEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: InternetGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.InternetGatewayId!,
        name: val.InternetGatewayId!,
        category: InternetGatewayEntity.category,
        subcategory: InternetGatewayEntity.subcategory,
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
        command: InternetGatewayEntity.command,
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

    internetGateway(val) {
      return {
        ownerId: val.OwnerId,
        attachments:
          val.Attachments?.map((attachment) => ({
            vpcId: attachment.VpcId,
            state: attachment.State,
          })) ?? [],
      };
    },
  },
};
