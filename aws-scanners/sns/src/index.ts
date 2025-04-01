import { SNSClient } from "@aws-sdk/client-sns";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListTopics,
  GetTopicAttributes,
  ListSubscriptionsByTopic,
  ListTagsForResource,
} from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";
import { SNSTopicEntity } from "./graph";

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
  getNodes,
  getEdges,
  entities: [SNSTopicEntity],
};

export default SNSScanner;
