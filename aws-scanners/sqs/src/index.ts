import { SQSClient } from "@aws-sdk/client-sqs";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListQueues,
  ListQueueTags,
  GetQueueAttributes,
} from "./generated/getters";
import { getEdges } from "./edges";
import { SQSEntity } from "./graph";

const SQSScanner: ServiceModule<SQSClient, "aws"> = {
  provider: "aws",
  service: "sqs",
  key: "SQS",
  getClient,
  callPerRegion: true,
  getters: [ListQueues, ListQueueTags, GetQueueAttributes],
  getEdges,
  entities: [SQSEntity],
};

export type { GraphState, SQS, QueueAttributes } from "./graph";

export default SQSScanner;
