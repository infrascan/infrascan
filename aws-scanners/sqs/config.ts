import * as SQS from "@aws-sdk/client-sqs";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type SQSFunctions =
  | "ListQueues"
  | "ListQueueTags"
  | "GetQueueAttributes";
const SQSScanner: ScannerDefinition<"SQS", typeof SQS, SQSFunctions> = {
  provider: "aws",
  service: "sqs",
  clientKey: "SQS",
  key: "SQS",
  callPerRegion: true,
  getters: [
    {
      fn: "ListQueues",
    },
    {
      fn: "ListQueueTags",
      parameters: [
        {
          Key: "QueueUrl",
          Selector: "SQS|ListQueues|[]._result[].QueueUrl",
        },
      ],
    },
    {
      fn: "GetQueueAttributes",
      parameters: [
        {
          Key: "QueueUrl",
          Selector: "SQS|ListQueues|[]._result[].QueueUrl",
        },
        {
          Key: "AttributeNames",
          Value: ["All"],
        },
      ],
    },
  ],
  nodes: ["SQS|GetQueueAttributes|[]._result.{id:QueueArn,name:QueueName}"],
  edges: [
    {
      state: "SQS|GetQueueAttributes|[]",
      from: "_result.QueueArn",
      to: "_result.RedrivePolicy.{target:deadLetterTargetArn}",
    },
  ],
};

export default SQSScanner;
