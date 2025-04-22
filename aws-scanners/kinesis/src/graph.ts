import type {
  Consumer,
  ConsumerStatus,
  DescribeStreamSummaryCommandInput,
  DescribeStreamSummaryCommandOutput,
  ListStreamConsumersCommandOutput,
  ListStreamConsumersInput,
  StreamDescriptionSummary,
  StreamMode,
  StreamStatus,
} from "@aws-sdk/client-kinesis";
import { evaluateSelector, toLowerCase } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export interface StreamDetails {
  mode?: Lowercase<StreamMode>;
  status?: Lowercase<StreamStatus>;
}

export interface ConsumerDetails {
  status?: Lowercase<ConsumerStatus>;
}

export type KinesisStream = BaseState<DescribeStreamSummaryCommandInput> & {
  kinesis: {
    stream?: StreamDetails;
    consumer?: ConsumerDetails;
  };
};

type StreamDescription = DescribeStreamSummaryCommandOutput & {
  StreamDescriptionSummary: StreamDescriptionSummary;
};

export const KinesisStreamEntity: TranslatedEntity<
  KinesisStream,
  State<DescribeStreamSummaryCommandOutput, DescribeStreamSummaryCommandInput>,
  WithCallContext<StreamDescriptionSummary, DescribeStreamSummaryCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "kinesis",
  provider: "aws",
  command: "DescribeStreamSummary",
  category: "kinesis",
  subcategory: "stream",
  nodeType: "kinesis-stream",
  selector: "Kinesis|DescribeStreamSummary|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      KinesisStreamEntity.selector,
      state,
    );
  },

  translate(val) {
    if (val._result.StreamDescriptionSummary == null) {
      return [];
    }
    const enrichedDescription = Object.assign(
      val._result.StreamDescriptionSummary,
      {
        $metadata: val._metadata,
        $parameters: val._parameters,
      },
    );
    return [enrichedDescription];
  },

  components: {
    $metadata(val) {
      return {
        version: KinesisStreamEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.StreamARN!,
        label: val.StreamName!,
        nodeType: KinesisStreamEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: KinesisStreamEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: KinesisStreamEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.StreamARN!,
        name: val.StreamName!,
        category: KinesisStreamEntity.category,
        subcategory: KinesisStreamEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: val.StreamCreationTimestamp,
      };
    },

    kinesis(val) {
      return {
        stream: {
          mode:
            val.StreamModeDetails?.StreamMode != null
              ? toLowerCase(val.StreamModeDetails?.StreamMode)
              : undefined,
          status:
            val.StreamStatus != null
              ? toLowerCase(val.StreamStatus)
              : undefined,
        },
      };
    },

    encryption(val) {
      return {
        keyId: val.KeyId,
      };
    },
  },
};

export type KinesisConsumer = BaseState<DescribeStreamSummaryCommandInput> & {
  kinesis: {
    status?: Lowercase<ConsumerStatus>;
  };
};

export const KinesisConsumerEntity: TranslatedEntity<
  KinesisStream,
  State<ListStreamConsumersCommandOutput, ListStreamConsumersInput>,
  WithCallContext<Consumer, ListStreamConsumersInput>
> = {
  version: "0.1.0",
  debugLabel: "kinesis",
  provider: "aws",
  command: "ListStreamConsumers",
  category: "kinesis",
  subcategory: "consumer",
  nodeType: "kinesis-consumer",
  selector: "Kinesis|ListStreams|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      KinesisConsumerEntity.selector,
      state,
    );
  },

  translate(val) {
    return (val._result.Consumers ?? []).map((stream) =>
      Object.assign(stream, {
        $metadata: val._metadata,
        $parameters: val._parameters,
      }),
    );
  },

  components: {
    $metadata(val) {
      return {
        version: KinesisConsumerEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.ConsumerARN!,
        label: val.ConsumerName!,
        nodeType: KinesisConsumerEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: KinesisConsumerEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: KinesisConsumerEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.ConsumerARN!,
        name: val.ConsumerName!,
        category: KinesisConsumerEntity.category,
        subcategory: KinesisConsumerEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: val.ConsumerCreationTimestamp,
      };
    },

    kinesis(val) {
      return {
        consumer: {
          status:
            val.ConsumerStatus != null
              ? toLowerCase(val.ConsumerStatus)
              : undefined,
        },
      };
    },
  },
};
