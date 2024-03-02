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
          Selector: "SQS|ListQueues|[]._result.QueueUrls[]",
        },
      ],
    },
    {
      fn: "GetQueueAttributes",
      parameters: [
        {
          Key: "QueueUrl",
          Selector: "SQS|ListQueues|[]._result.QueueUrls[]",
        },
        {
          Key: "AttributeNames",
          Value: ["All"],
        },
      ],
    },
  ],
  nodes: [
    "SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,arn:QueueArn,name:QueueArn}",
  ],
};

export default SQSScanner;
