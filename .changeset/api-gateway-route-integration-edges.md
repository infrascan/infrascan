---
"@infrascan/aws-api-gateway-scanner": minor
---

Routes and integrations are scanned (`GetRoutes`, `GetIntegrations`) and graphed as informational nodes beneath their API. Edges are derived from routes: each API links to the resources its routes' integrations invoke (Lambda functions, including aliases and invocation URIs, SQS queues, Step Functions state machines, EventBridge buses, Kinesis streams, and load balancers behind VPC links), labelled with the routes that use them. Integration credentials roles are reported for IAM edges.

Every API Gateway node records the API it is, or belongs to, as `apiGateway.api.id`, which replaces `apiGateway.apiId` on API nodes. `apiGateway.managed` is likewise recorded at the top level rather than per resource.
