# @infrascan/sdk

The Infrascan SDK allows you to scan your AWS accounts and graph the downloaded state. Most uses should use the CLI. The SDK is designed to allow self-hosting, alternate connectors, or to include custom scanners.

The SDK exposes two functions, `performScan` and `generateGraph` which are designed to be composed.

## Quickstart

```ts
import Infrascan from "@infrascan/sdk";
import buildFsConnector from "@infrascan/fs-connector";
import { registerAwsScanners } from "@infrascan/aws";
import { fromIni } from "@aws-sdk/credential-providers";

const credentials = fromIni({ profile: "dev" });
const regions = ["us-east-1", "us-west-1"];
const services = ["SNS", "Lambda", "S3"];

const connector = buildFsConnector("state");
const infrascan = registerAwsScanners(new Infrascan());

infrascan
  .performScan(credentials, connector)
  .then(function (scanMetadata) {
    console.log("Scan Complete!", scanMetadata);
    return infrascan.generateGraph(scanMetadata, connector);
  })
  .then(function (graphData) {
    console.log("Graph generated!", graphData);
  })
  .catch(function (err) {
    console.error("Failed to scan", err);
  });
```
