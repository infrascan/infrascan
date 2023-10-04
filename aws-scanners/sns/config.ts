import * as SNS from "@aws-sdk/client-sns";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type SNSFunctions =
  | "ListTopics"
  | "GetTopicAttributes"
  | "ListSubscriptionsByTopic"
  | "ListTagsForResource";
const SNSScanner: ScannerDefinition<"SNS", typeof SNS, SNSFunctions> = {
  provider: "aws",
  service: "sns",
  clientKey: "SNS",
  key: "SNS",
  callPerRegion: true,
  getters: [
    {
      fn: "ListTopics",
    },
    {
      fn: "GetTopicAttributes",
      parameters: [
        {
          Key: "TopicArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
    },
    {
      fn: "ListSubscriptionsByTopic",
      parameters: [
        {
          Key: "TopicArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
    },
    {
      fn: "ListTagsForResource",
      parameters: [
        {
          Key: "ResourceArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
    },
  ],
  nodes: ["SNS|ListTopics|[]._result[].TopicArn"],
  edges: [
    {
      state: "SNS|ListSubscriptionsByTopic|[]",
      from: "_parameters.TopicArn",
      to: "_result[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}",
    },
  ],
};

export default SNSScanner;
