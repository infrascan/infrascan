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

## API Reference

### Class: Infrascan

The main SDK class for scanning AWS infrastructure and generating graphs.

#### Methods

##### `registerScanner(scanner: ServiceModule<any, Provider>): void`

Registers a service scanner with the Infrascan instance.

**Parameters:**

- `scanner` - A service scanner module implementing the [`ServiceModule`](https://github.com/infrascan/infrascan/blob/main/packages/shared-types/src/api.ts#L120-L141) interface

**Example:**

```ts
import LambdaScanner from "@infrascan/aws-lambda-scanner";
const infrascan = new Infrascan();
infrascan.registerScanner(LambdaScanner);
```

**Note:** you most likely want to use `@infrascan/aws` to register all scanners. You should only manually register services if you only want to scan a specific subset of your account.

##### `registerPlugin<E extends GraphPluginEvents>(plugin: GraphPlugin<E>): void`

Registers a plugin to be executed during graph generation lifecycle events.

**Parameters:**

- `plugin` - A plugin implementing the [`GraphPlugin`](https://github.com/infrascan/infrascan/blob/main/packages/shared-types/src/plugins.ts#L52-L56) interface

**Supported Events:**

- `onServiceComplete` - Called after each service scan completes
- `onRegionComplete` - Called after each region scan completes
- `onAccountComplete` - Called after each account scan completes
- `onGraphComplete` - Called after the entire graph is generated

**Example:**

```ts
infrascan.registerPlugin({
  id: "my-plugin",
  event: "onGraphComplete",
  handler: (graph) => {
    console.log(`Graph has ${graph.nodes.length} nodes`);
  },
});
```

##### `performScan(credentialProvider: ScanCredentialProvider, connector: Connector, opts?: ScanOptions): Promise<ScanMetadata>`

Performs a scan of AWS infrastructure.

**Parameters:**

- `credentialProvider` - AWS credential provider from [`@aws-sdk/credential-providers`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-credential-providers/), or a credential provider factory which returns an AWS credential provider based on the region given.
- `connector` - Storage connector implementing the [`Connector`](https://github.com/infrascan/infrascan/blob/main/packages/shared-types/src/api.ts#L72-L76) interface. Suggestion: `@infrascan/fs-connector`
- `opts` - Optional scan configuration
  - `regions?: string[]` - Specific regions to scan (defaults to all available regions)
  - `defaultRegion?: string` - Default region for global services (defaults to "us-east-1")
  - `retryStrategy?: RetryStrategy` - AWS SDK retry strategy from [`@aws-sdk/types`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-types/)

**Returns:** Promise resolving to [`ScanMetadata`](https://github.com/infrascan/infrascan/blob/main/packages/sdk/src/scan.ts#L142-L146) containing the high level details of the completed scan (accounts scanned, regions, etc.).

**Example:**

```ts
import { fromIni } from "@aws-sdk/credential-providers";
import buildFsConnector from "@infrascan/fs-connector";

const credentials = fromIni({ profile: "production" });
const connector = buildFsConnector("./scan-data");

const scanMetadata = await infrascan.performScan(credentials, connector, {
  regions: ["us-east-1", "us-west-2"],
  defaultRegion: "us-east-1",
});
```

##### `generateGraph<T>(scanMetadata: ScanMetadata | ScanMetadata[], connector: Connector, graphSerializer: GraphSerializer<T>): Promise<T>`

Generates an infrastructure graph from scan metadata.

**Parameters:**

- `scanMetadata` - Single scan metadata or array of scan metadata from `performScan()`
- `connector` - Storage connector used during scanning. Suggestion: `@infrascan/fs-connector`
- `graphSerializer` - Function to serialize the graph, implementing [`GraphSerializer<T>`](https://github.com/infrascan/infrascan/blob/main/packages/shared-types/src/graph.ts#L97). Suggestion: `@infrascan/cytoscape-serializer`

**Returns:** Promise resolving to serialized graph data of type `T` (informed by the serializer used).

**Example:**

```ts
import { writeFile } from "node:fs/promises";
import { serializeGraph } from "@infrascan/cytoscape-serializer";

const graphData = await infrascan.generateGraph(
  scanMetadata,
  connector,
  serializeGraph,
);
// save the graph to inspect
await writeFile("./graph-output.json", JSON.stringify(graphData, undefined, 2));
```

### Types

#### `ScanMetadata`

Contains metadata about a completed scan including account ID, scanned regions, and default region.

#### `ScanCredentialProvider`

Type alias for AWS credential providers compatible with the SDK.

#### `CredentialProviderFactory`

Factory function type for creating credential providers with specific configurations.
