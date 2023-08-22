# @infrascan/sdk

The Infrascan SDK allows you to scan your AWS accounts and graph the downloaded state.

The SDK exposes two functions, `performScan` and `generateGraph` which are designed to be composed.

## Quickstart
```ts
 import { performScan, generateGraph } from "@infrascan/sdk";
 import buildFsConnector from "@infrascan/fs-connector";
 import { fromIni } from "@aws-sdk/credential-providers";
 
 const credentials = fromIni({ profile: "dev" });
 const regions = ["us-east-1","us-west-1"];
 const services = ["SNS","Lambda","S3"];

 const {
  onServiceScanComplete,
  resolveStateForServiceFunction,
  getGlobalStateForServiceFunction
 } = buildFsConnector('state');

 performScan({
  credentials,
  regions,
  services,
  onServiceScanComplete,
  resolveStateForServiceCall: resolveStateForServiceFunction
 }).then(function (scanMetadata) {
  console.log("Scan Complete!", scanMetadata);
  return generateGraph({
    scanMetadata,
    resolveStateForServiceCall,
    getGlobalStateForServiceFunction
  });
 }).then(function (graphData) {
  console.log("Graph generated!", graphData);
 }).catch(function (err) {
  console.error("Failed to scan", err);
});
```