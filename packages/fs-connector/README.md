# @infrascan/fs-connector

Infrascan connectors act as the plumbing between the Infrascan SDK and wherever you persist your scan state.

The Fs connector uses the local filesystem. This library exposes a single builder function which takes a base path to use as the directory. 

All state files are written into the directory in the format: `<account>-<region>-<service>-<function>.json`.

## Quickstart

```js
import Infrascan from "@infrascan/sdk";
import buildFsConnector from "@infrascan/fs-connector";
import { registerAwsScanners } from "@infrascan/aws";
import { fromIni } from "@aws-sdk/credential-providers";

const credentials = fromIni({ profile: "dev" });
const regions = ["us-east-1","us-west-1"];
const services = ["SNS","Lambda","S3"];

const connector = buildFsConnector('state');
const infrascan = registerAwsScanners(new Infrascan());

infrascan.performScan(
  credentials,
  connector
).then(function (scanMetadata) {
  console.log("Scan Complete!", scanMetadata);
  return infrascan.generateGraph(
    scanMetadata,
    connector
  );
}).then(function (graphData) {
  console.log("Graph generated!", graphData);
}).catch(function (err) {
  console.error("Failed to scan", err);
});
```