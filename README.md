<h1 align="center">Infrascan</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@infrascan/sdk" alt="@infrascan/sdk version on npm">
    <img src="https://img.shields.io/npm/v/%40infrascan%2Fsdk?label=%40infrascan%2Fsdk" />
  </a>
  <a href="https://www.npmjs.com/package/@infrascan/cli" alt="@infrascan/cli version on npm">
    <img src="https://img.shields.io/npm/v/%40infrascan%2Fsdk?label=%40infrascan%2Fcli" />
  </a>
</p>

Infrascan is a set of open-source tools to help you make sense of your cloud infrastructure.

![Example Infrastructure map of an AWS Account](./assets/infrastructure-diagram.png)

This repo contains the Infrascan SDK, Config, and CLI, as well as private packages used during development.

## CLI Quickstart

### Install

```sh
npm i -g @infrascan/cli
```

To get started perform a scan:

```sh
# The CLI will use the default AWS credential providers chain, and will respect any standard AWS environment variables used to configure it.
AWS_PROFILE=readonly infrascan scan --region us-east-1 --region eu-west-1 -o scan-output
```

Then generate a graph:

```sh
infrascan graph -i scan-output
```

This will output a JSON file containing the graph details. To view the graph locally, run:

```sh
infrascan render --browser -i scan-output/graph.json
```

Or you can copy your graph and paste it into [render.infrascan.io](https://render.infrascan.io)

## SDK Quickstart

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

## Coverage

This project aims to be able to generate arbitrary infrastructure diagrams in most AWS deployments. This will always be a work in progress. Current covered AWS Services are listed below.

<details>
  <summary>Supported Services</summary>

- Api-Gateway
- Autoscaling
- Cloudfront
- Cloudwatch-logs
- DynamoDB
- EC2
- ECS
- Elastic Load Balancing
- Lambda
- RDS
- Route53
- S3
- SNS
- SQS

</details>

## Design (wip)

To simplify adding support for additional services, the logic for scanning any one service is encapsulated in a Scanner. Each Scanner implements a `ServiceModule` interface which allows the SDK to create clients for the service, pull state, and generate graph elements.

The standard structure over every scanner also allows the majority of the code to be generated based on a simple config file. The codegen project can be found in the private [@infrascan/codegen package](./aws-scanners/codegen).

## Project Directory

The packages involved in Infrascan development are split across three top-level workspaces: apps, internal and packages.

### apps

- `render` — a playground for quickly visualizing Infrascan graph outputs, available at [render.infrascan.io](https://render.infrascan.io).

### internal

- `codegen` — a small [ejs](https://github.com/mde/ejs) project which converts the per service configs from `@infrascan/config` into typescript modules based on a set of templates.
- `shared-types` — a set of type definitions shared across multiple packages
- `tsconfig` — the base tsconfig definition for the typescript projects in this repo, as recommended by [turbo build](https://turbo.build/repo/docs/handbook/linting/typescript#sharing-tsconfigjson).
- `eslint-config-custom` — the eslint config for the projects in this repo. Enforces airbnb style guide with some pre-project overrides where relevant.

### packages

- `cli` — a minimal CLI to scan and graph your infrastructure, saving output to your local FS.
- `config` — definitions of the per service scanners and graphers, used to generate the SDK.
- `sdk` — the SDK used to generate scans and graphs of your AWS Infrastructure.
