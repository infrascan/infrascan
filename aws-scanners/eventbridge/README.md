# @infrascan/aws-eventbridge-scanner

A scanner module for AWS EventBridge, designed to be used with the [@infrascan/sdk](../../packages/sdk).

This module pulls information about the EventBridge resources in an AWS account by calling: `ListEventBuses`, `DescribeEventBus`, `ListRules`, `ListTargetsByRule`, `ListApiDestinations`, and `ListConnections`.

It produces event bus, rule and API destination nodes, and the following edges:

- event bus → rule
- rule → each target (Lambda, SQS, SNS, Step Functions, Kinesis, ECS, CloudWatch Logs, API destinations, other event buses, …). Lambda alias and version ARNs are normalized to the function.
- rule → target dead-letter queue
- event bus → dead-letter queue

Target `Input`, `InputTransformer` and `HttpParameters` are kept in the raw scan state but never copied onto graph nodes, as they can contain secrets.

## Quickstart

```javascript
import EventBridgeScanner from "@infrascan/aws-eventbridge-scanner";
import Infrascan from "@infrascan/sdk";

const infrascanClient = new Infrascan();
infrascanClient.registerScanner(EventBridgeScanner);
```

If you plan on scanning all of an AWS account, you should use the [@infrascan/aws](../../packages/aws) package.

## Contributing

The getters are mostly generated from the [config.ts](./config.ts) file. `ListTargetsByRule` is hand-written in [src/getters.ts](./src/getters.ts) because it needs each rule paired with the bus it was listed on, and edges are hand-written in [src/edges.ts](./src/edges.ts).
