import { SQSClient } from "@aws-sdk/client-sqs";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListQueues,
  ListQueueTags,
  GetQueueAttributes,
} from "./generated/getters";
import { getNodes } from "./generated/graph";
import { getEdges } from "./edges";
import { SQSEntity } from "./graph";

const SQSScanner: ServiceModule<SQSClient, "aws"> = {
  provider: "aws",
  service: "sqs",
  key: "SQS",
  getClient,
  callPerRegion: true,
  getters: [ListQueues, ListQueueTags, GetQueueAttributes],
  getNodes,
  getEdges,
  entities: [SQSEntity],
};

export default SQSScanner;
