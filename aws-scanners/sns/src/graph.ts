import type {
  GetTopicAttributesCommandInput,
  GetTopicAttributesCommandOutput,
  ListSubscriptionsByTopicCommandInput,
  ListSubscriptionsByTopicCommandOutput,
  Subscription,
} from "@aws-sdk/client-sns";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export interface TopicAttributes {
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
  endpoint?: {
    protocol?: string;
    target?: string;
  };
}

export type SNSEntity = BaseState<GetTopicAttributesCommandInput> & {
  sns: SNS;
};
export type GraphState = SNSEntity;

export const SNSTopicEntity: TranslatedEntity<
  SNSEntity,
  State<GetTopicAttributesCommandOutput, GetTopicAttributesCommandInput>,
  WithCallContext<TopicAttributes, GetTopicAttributesCommandInput>
> = {
  version: "0.1.1",
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
        nodeClass: "visual",
        nodeType: SNSTopicEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
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

export const SNSSubscriptionEntity: TranslatedEntity<
  SNSEntity,
  State<
    ListSubscriptionsByTopicCommandOutput,
    ListSubscriptionsByTopicCommandInput
  >,
  WithCallContext<Subscription, ListSubscriptionsByTopicCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "sns-subscription",
  provider: "aws",
  command: "ListSubscriptionsByTopic",
  category: "sns",
  subcategory: "subscription",
  nodeType: "sns-subscription",
  selector: "SNS|ListSubscriptionsByTopic|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      SNSSubscriptionEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.Subscriptions?.map((subscription) => ({
        ...subscription,
        $metadata: val._metadata,
        $parameters: val._parameters,
      })).filter((enrichedSub) => enrichedSub != null) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: SNSSubscriptionEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.SubscriptionArn!,
        label: val.SubscriptionArn!.split(":").pop()!,
        nodeClass: "informational",
        nodeType: SNSSubscriptionEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: SNSSubscriptionEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: SNSSubscriptionEntity.provider,
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
        id: val.SubscriptionArn!,
        name: topicName,
        category: SNSSubscriptionEntity.category,
        subcategory: SNSSubscriptionEntity.subcategory,
      };
    },

    sns(val) {
      return {
        displayName: val.SubscriptionArn,
        endpoint: {
          protocol: val.Protocol,
          target: val.Endpoint,
        },
      };
    },
  },
};
