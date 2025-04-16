import type {
  GetTopicAttributesCommandInput,
  GetTopicAttributesCommandOutput,
} from "@aws-sdk/client-sns";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

interface TopicAttributes {
  DeliveryPolicy?: string;
  DisplayName?: string;
  EffectiveDeliveryPolicy?: string;
  Owner?: string;
  Policy?: string;
  SignatureVersion?: string;
  SubscriptionsConfirmed?: string;
  SubscriptionsDeleted?: string;
  SubscriptionsPending?: string;
  TopicArn?: string;
  TracingConfig?: string;
  KmsMasterKeyId?: string;
  ArchivePolicy?: string;
  BeginningArchiveTime?: string;
  ContentBasedDeduplication?: string;
  FifoTopic?: string;
}

export interface SNS {
  displayName?: string;
  fifo?: boolean;
  contentBasedDeduplication?: string;
  signatureVersion?: string;
  subscriptions?: {
    confirmed?: number;
    deleted?: number;
    pending?: number;
  };
  archive?: {
    policy?: string;
    beginningTime?: string;
  };
}

export type SNSEntity = BaseState<GetTopicAttributesCommandInput> & {
  sns: SNS;
};

export const SNSTopicEntity: TranslatedEntity<
  SNSEntity,
  State<GetTopicAttributesCommandOutput, GetTopicAttributesCommandInput>,
  WithCallContext<TopicAttributes, GetTopicAttributesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "sns-topic",
  provider: "aws",
  command: "GetTopicAttributes",
  category: "sns",
  subcategory: "topic",
  nodeType: "sns-topic",
  selector: "SNS|GetTopicAttributes|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      SNSTopicEntity.selector,
      state,
    );
  },

  translate(val) {
    return [
      {
        ...(val._result.Attributes ?? {}),
        $metadata: val._metadata,
        $parameters: val._parameters,
      },
    ];
  },

  components: {
    $metadata(val) {
      return {
        version: SNSTopicEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.TopicArn!,
        label: val.TopicArn!.split(":").pop()!,
        nodeType: SNSTopicEntity.nodeType,
      };
    },

    $source(val) {
      return {
        command: SNSTopicEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: SNSTopicEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      const topicName = val.TopicArn!.split(":").pop()!;
      return {
        id: val.TopicArn!,
        name: topicName,
        category: SNSTopicEntity.category,
        subcategory: SNSTopicEntity.subcategory,
        policy: val.Policy,
      };
    },

    encryption(val) {
      return {
        keyId: val.KmsMasterKeyId,
      };
    },

    sns(val) {
      const confirmed =
        val.SubscriptionsConfirmed != null
          ? parseInt(val.SubscriptionsConfirmed, 10)
          : 0;
      const deleted =
        val.SubscriptionsDeleted != null
          ? parseInt(val.SubscriptionsDeleted, 10)
          : 0;
      const pending =
        val.SubscriptionsPending != null
          ? parseInt(val.SubscriptionsPending, 10)
          : 0;
      return {
        fifo: val.FifoTopic === "true",
        contentBasedDeduplication: val.ContentBasedDeduplication,
        signatureVersion: val.SignatureVersion,
        displayName: val.DisplayName,
        subscriptions: {
          confirmed,
          deleted,
          pending,
        },
        archive: {
          policy: val.ArchivePolicy,
          beginningTime: val.BeginningArchiveTime,
        },
      };
    },
  },
};
