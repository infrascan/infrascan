import type {
  ListBucketsCommandInput,
  ListBucketsCommandOutput,
  Bucket,
} from "@aws-sdk/client-s3";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export type GraphState = BaseState<ListBucketsCommandInput>;
export const S3Entity: TranslatedEntity<
  BaseState<ListBucketsCommandInput>,
  State<ListBucketsCommandOutput, ListBucketsCommandInput>,
  WithCallContext<Bucket, ListBucketsCommandInput>
> = {
  version: "0.1.1",
  debugLabel: "s3-bucket",
  provider: "aws",
  command: "ListBuckets",
  category: "s3",
  subcategory: "bucket",
  nodeType: "s3-bucket",
  selector: "S3|ListBuckets|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      S3Entity.selector,
      state,
    );
  },

  translate(val) {
    return (val._result.Buckets ?? []).map((bucket: Bucket) => ({
      ...bucket,
      $metadata: val._metadata,
      $parameters: val._parameters,
    }));
  },

  components: {
    $metadata(val) {
      return {
        version: S3Entity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: `arn:aws:s3:::${val.Name!}`,
        label: val.Name!,
        nodeClass: "visual",
        nodeType: S3Entity.nodeType,
        parent: val.$metadata.account,
      };
    },

    $source(val) {
      return {
        command: S3Entity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: S3Entity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val: WithCallContext<Bucket, ListBucketsCommandInput>) {
      return {
        id: `arn:aws:s3:::${val.Name!}`,
        name: val.Name!,
        category: S3Entity.category,
        subcategory: S3Entity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: val.CreationDate,
      };
    },
  },
};
