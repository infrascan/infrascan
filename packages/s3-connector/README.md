# @infrascan/s3-connector

Infrascan connectors act as the plumbing between the Infrascan SDK and wherever you persist your scan state. The S3 connector uses an AWS S3 Bucket to store its state, providing a scalable and durable solution for storing and retrieving scan data.

## Features

- Storage and retrieval using AWS S3
- Caching to reduce S3 read operations
- Flexible object naming strategy for easy data organization and retrieval
- Support for multi-tenant and multi-region scans

## Installation

```bash
npm install @infrascan/s3-connector
```

## Quickstart

```js
import { fromIni } from "@aws-sdk/credential-providers";
import { S3Client } from "@aws-sdk/client-s3";
import Infrascan from "@infrascan/sdk";
import S3Connector from "@infrascan/s3-connector";
import { registerAwsScanners } from "@infrascan/aws";

const credentials = fromIni({ profile: "dev" });
const s3Client = new S3Client({ credentials });
const connector = new S3Connector({
  S3: s3Client,
  prefix: "my-scan-tenant",
  bucket: "my-scan-output-bucket",
});
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

## Object Naming Strategy

The S3 connector uses a structured naming convention for storing scan state files in S3. This strategy is designed to support flexible retrieval, and support multi-tenancy.

Object keys are structured as follows:

```sh
/{prefix}/{service}-{function}/{account}/{region}.json
```

- `{prefix}`: An optional prefix to support multi-tenant usage (specified in the connector configuration)
- `{service}`: The AWS service which was scanned (e.g. "ec2")
- `{function}`: The specific function that generated the state (e.g. "DescribeInstances")
- `{account}`: The AWS account ID
- `{region}`: The AWS region

This structure allows for:

1. Easy filtering of objects by service, account, or region
2. Support for global and regional service scans

Example object key:

```sh
/my-scan-tenant/ec2-DescribeInstances/123456789012/us-west-2.json
```

## Caching Strategy

The S3Connector implements a caching mechanism to reduce the number of S3 read operations, improving performance and reducing costs. It is implemented as a simple in-memory, bounded cache, defaulting to 10 items.

The cache is particularly beneficial during graph generation, where the same state data may be accessed multiple times.

## Configuration Options

The S3Connector constructor accepts the following options:

- `S3`: An instance of the AWS SDK S3 client
- `bucket`: The name of the S3 bucket to use for state storage
- `prefix` (optional): A prefix to prepend to all object keys (useful for multi-tenant setups)
- `cacheSize` (optional): The maximum number of items to keep in the cache (default: 10)

## Retries

The S3 connector receives an S3 client as an argument. This can be configured using the standard AWS retry strategy tooling.

## Performance Considerations

To optimize performance when using the S3Connector:

1. Choose an S3 bucket in the same region as your scanning operations to reduce latency.
2. Consider increasing the `cacheSize` for large scans to reduce S3 read operations.
3. Use appropriate S3 bucket policies to ensure minimal access latency.

## Security

The S3Connector relies on the provided S3 client for authentication. Ensure that the AWS credentials used have the necessary permissions to read from and write to the specified S3 bucket.
