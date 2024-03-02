import * as Kinesis from "@aws-sdk/client-kinesis";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type KinesisFunctions = "ListStreams" | "ListStreamConsumers";

const KinesisScanner: ScannerDefinition<
  "Kinesis",
  typeof Kinesis,
  KinesisFunctions
> = {
  provider: "aws",
  service: "kinesis",
  clientKey: "Kinesis",
  key: "Kinesis",
  callPerRegion: true,
  getters: [
    {
      fn: "ListStreams",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "ListStreamConsumers",
      parameters: [
        {
          Key: "StreamARN",
          Selector:
            "Kinesis|ListStreams|[]._result.StreamSummaries[].StreamARN",
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
  ],
  nodes: [
    "Kinesis|ListStreams|[]._result.StreamSummaries[].{id:StreamARN,arn:StreamARN,name:StreamName}",
    "Kinesis|ListStreamConsumers|[]._result.Consumers[].{id:ConsumerARN,arn:ConsumerARN,name:ConsumerName}",
  ],
  edges: [
    {
      state: "Kinesis|ListStreamConsumers|[]",
      from: "_parameters.StreamARN",
      to: "_result.Consumers[].{target:ConsumerARN,name:ConsumerName}",
    },
  ],
};

export default KinesisScanner;
