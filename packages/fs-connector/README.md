# @infrascan/fs-connector

Infrascan connectors act as the plumbing between the Infrascan SDK and wherever you persist your scan state.

The FS connector uses the local filesystem. This library exposes a single builder function which takes a base path to use as the directory. 

All state files are written into the directory in the format: `<account>-<region>-<service>-<function>.json`.

## Quickstart

```js
import buildFsConnector from "@infrascan/fs-connector";
import { performScan } from "@infrascan/sdk";
import { fromIni } from "@aws-sdk/credential-providers";

const connector = buildFsConnector('state');

const credentials = fromIni({ profile: "dev" });
await performScan(credentials, connector);
```