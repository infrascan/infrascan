import { KinesisClient } from "@aws-sdk/client-kinesis";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { ListStreams, ListStreamConsumers } from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";
import { KinesisConsumerEntity, KinesisStreamEntity } from "./graph";

const KinesisScanner: ServiceModule<KinesisClient, "aws"> = {
  provider: "aws",
  service: "kinesis",
  key: "Kinesis",
  getClient,
  callPerRegion: true,
  getters: [ListStreams, ListStreamConsumers],
  getNodes,
  getEdges,
  entities: [KinesisConsumerEntity, KinesisStreamEntity],
};

export default KinesisScanner;
