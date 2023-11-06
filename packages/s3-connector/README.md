# @infrascan/s3-connector

Infrascan connectors act as the plumbing between the Infrascan SDK and wherever you persist your scan state.

The S3 connector uses an AWS S3 Bucket. This library exposes a single builder function which takes a base path to use as the directory. 

All state files are written into the bucket in the format: /service/function/account/region.json.
This is to support both searching state globally and reading state by function call per region.

## Quickstart

```js
import Infrascan from "@infrascan/sdk";
import buildS3Connector from "@infrascan/s3-connector";
import { registerAwsScanners } from "@infrascan/aws";
import { fromIni } from "@aws-sdk/credential-providers";

const credentials = fromIni({ profile: "dev" });
const connector = buildS3Connector();
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