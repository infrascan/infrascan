# @infrascan/aws-elastic-load-balancing-scanner

A scanner module for AWS Elastic Load Balancing, designed to be used with the [@infrascan/sdk](../../packages/sdk).

This module pulls information about the Elastic Load Balancing resources in an AWS account by calling: `DescribeLoadBalancers`, `DescribeTargetGroups`, `DescribeListeners`, and `DescribeRules`.

## Quickstart

```javascript
import ElasticLoadBalancingScanner from "@infrascan/aws-elastic-load-balancing-scanner";
import Infrascan from "@infrascan/sdk";

const infrascanClient = new Infrascan();
infrascanClient.registerScanner(ElasticLoadBalancingScanner);
```

If you plan on scanning all of an AWS account, you should use the [@infrascan/aws](../../packages/aws) package.

## Contributing

The majority of the scanner modules are autogenerated from their [config.ts](./config.ts) file. 

Changes such as adding a new function/endpoint in the service to scan can be done within the config file. 

More significant changes will likely need to take place in the [aws-codegen](../codegen) package.