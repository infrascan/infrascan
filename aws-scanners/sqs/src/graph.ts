import type {
  GetQueueAttributesCommandInput,
  GetQueueAttributesCommandOutput,
  QueueAttributeName,
} from "@aws-sdk/client-sqs";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export type QueueAttributes = Partial<
  Record<Exclude<QueueAttributeName, "All">, string>
>;

export interface SQS {
  fifo?: boolean;
  contentBasedDeduplication?: boolean;
  delaySeconds?: number;
  maxMessageSize?: number;
  messageRetentionPeriod?: number;
  receiveMessageWaitTimeSeconds?: number;
  visibilityTimeout?: number;
  redrivePolicy?: string;
}

export type SQSSchema = BaseState<GetQueueAttributesCommandInput> & {
  sqs: SQS;
};

export type GraphState = SQSSchema;

export const SQSEntity: TranslatedEntity<
  SQSSchema,
  State<GetQueueAttributesCommandOutput, GetQueueAttributesCommandInput>,
  WithCallContext<QueueAttributes, GetQueueAttributesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "sqs-queue",
  provider: "aws",
  command: "GetQueueAttributes",
  category: "sqs",
  subcategory: "queue",
  nodeType: "sqs-queue",
  selector: "SQS|GetQueueAttributes|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      SQSEntity.selector,
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
        version: SQSEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      const queueName = val.QueueArn!.split(":").pop()!;
      return {
        id: val.QueueArn!,
        label: queueName,
        nodeType: SQSEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: SQSEntity.command,
        parameters: val.$parameters,
      };
    },

    audit(val) {
      if (val.CreatedTimestamp == null) {
        return { createdAt: undefined };
      }
      const numericTs = parseInt(val.CreatedTimestamp, 10);
      const orderOfMagnitude = Math.floor(Math.log10(numericTs));
      if (orderOfMagnitude === 9) {
        return {
          createdAt: `${numericTs * 1e3}`,
        };
      }

      return {
        createdAt: `${numericTs}`,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: SQSEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      const queueName = val.QueueArn!.split(":").pop()!;
      return {
        id: val.QueueArn!,
        name: queueName,
        category: SQSEntity.category,
        subcategory: SQSEntity.subcategory,
        policy: val.Policy,
      };
    },

    encryption(val) {
      return {
        keyId: val.KmsMasterKeyId,
      };
    },

    sqs(val) {
      return {
        fifo: val.FifoQueue === "true",
        contentBasedDeduplication: val.ContentBasedDeduplication === "true",
        delaySeconds: val.DelaySeconds
          ? parseInt(val.DelaySeconds, 10)
          : undefined,
        messageRetentionPeriod: val.MessageRetentionPeriod
          ? parseInt(val.MessageRetentionPeriod, 10)
          : undefined,
        receiveMessageWaitTimeSeconds: val.ReceiveMessageWaitTimeSeconds
          ? parseInt(val.ReceiveMessageWaitTimeSeconds, 10)
          : undefined,
        visibilityTimeout: val.VisibilityTimeout
          ? parseInt(val.VisibilityTimeout, 10)
          : undefined,
        redrivePolicy: val.RedrivePolicy,
      };
    },
  },
};
