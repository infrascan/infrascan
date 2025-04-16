import * as Kinesis from "@aws-sdk/client-kinesis";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type KinesisFunctions =
  | "DescribeStreamSummary"
  | "ListStreams"
  | "ListStreamConsumers";

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
      fn: "DescribeStreamSummary",
      parameters: [
        {
          Key: "StreamARN",
          Selector:
            "Kinesis|ListStreams|[]._result.StreamSummaries[].StreamARN",
        },
      ],
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
  edges: [
    {
      state: "Kinesis|ListStreamConsumers|[]",
      from: "_parameters.StreamARN",
      to: "_result.Consumers[].{target:ConsumerARN,name:ConsumerName}",
    },
  ],
};

export default KinesisScanner;
