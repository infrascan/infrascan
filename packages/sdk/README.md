# @infrascan/sdk

The Infrascan SDK allows you to scan your AWS accounts and graph the downloaded state. Most uses should use the CLI. The SDK is designed to allow self-hosting, alternate connectors, or to include custom scanners.

The SDK exposes two functions, `performScan` and `generateGraph` which are designed to be composed.

## Quickstart

```ts
import Infrascan from "@infrascan/sdk";
import buildFsConnector from "@infrascan/fs-connector";
import { registerAwsScanners } from "@infrascan/aws";
import { serializeGraph } from "@infrascan/cytoscape-serializer";
import { reducerPluginFactory } from "@infrascan/node-reducer-plugin";
import { fromIni } from "@aws-sdk/credential-providers";

const credentials = fromIni({ profile: "dev" });
const regions = ["us-east-1", "us-west-1"];

const connector = buildFsConnector("state");
// Initialize the Infrascan client with all available services
const infrascan = registerAwsScanners(new Infrascan());

// Optionally register a plugin to mutate the graph
infrascan.registerPlugin(
  reducerPluginFactory([
    {
      // Collapse serverless deployment buckets into a single node
      id: "serverless-bucket-reducer",
      regex: /^(.+)(serverlessdeploymentbuck)(.*)$/,
      service: "s3",
    },
  ]),
);

infrascan
  .performScan(credentials, connector, { regions })
  .then(function (scanMetadata) {
    console.log("Scan Complete!", scanMetadata);
    return infrascan.generateGraph(scanMetadata, connector, serializeGraph);
  })
  .then(function (graphData) {
    console.log("Graph generated!");
  })
  .catch(function (err) {
    console.error("Failed to scan", err);
  });
```
