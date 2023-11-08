# @infrascan/s3-connector

Infrascan connectors act as the plumbing between the Infrascan SDK and wherever you persist your scan state.

The S3 connector uses an AWS S3 Bucket to store its state. This connector library exposes an S3Connector class as the default export, which wraps an cache internally to reduce the overhead of S3 reads.

All state files are written into the bucket in the format: /service-function/account/region.json.
This is to support both searching state globally and reading state by function call per region.

## Quickstart

```js
import { fromIni } from "@aws-sdk/credential-providers";
import { S3Client } from "@aws-sdk/s3-client";
import Infrascan from "@infrascan/sdk";
import S3Connector from "@infrascan/s3-connector";
import { registerAwsScanners } from "@infrascan/aws";

const credentials = fromIni({ profile: "dev" });
const s3Client = new S3Client({ credentials });
const connector = new S3Connector({
  S3: s3Client,
  prefix: 'my-scan-tenant',
  bucket: 'my-scan-output-bucket'
});
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