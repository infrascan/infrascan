import { SNSClient } from "@aws-sdk/client-sns";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListTopics,
  GetTopicAttributes,
  ListSubscriptionsByTopic,
  ListTagsForResource,
} from "./generated/getters";
import { getEdges } from "./generated/graph";
import { SNSSubscriptionEntity, SNSTopicEntity } from "./graph";

const SNSScanner: ServiceModule<SNSClient, "aws"> = {
  provider: "aws",
  service: "sns",
  key: "SNS",
  getClient,
  callPerRegion: true,
  getters: [
    ListTopics,
    GetTopicAttributes,
    ListSubscriptionsByTopic,
    ListTagsForResource,
  ],
  getEdges,
  entities: [SNSTopicEntity, SNSSubscriptionEntity],
};

export type { GraphState, SNS, TopicAttributes } from "./graph";

export default SNSScanner;
