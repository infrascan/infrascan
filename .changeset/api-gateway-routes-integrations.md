---
"@infrascan/aws-api-gateway-scanner": minor
---

Full API Gateway v2 integration. Routes, integrations, authorizers and stages are now scanned (`GetRoutes`, `GetIntegrations`, `GetAuthorizers`, `GetStages`; `GetApis` and `GetDomainNames` are paginated) and graphed as informational nodes beneath their API.

API nodes are now keyed by their ARN (`arn:aws:apigateway:{region}::/apis/{apiId}`) instead of their endpoint, which moves to `apiGateway.endpoint`, and are labelled by name.

Edges are derived from routes: each API links to the resources its routes' integrations invoke (Lambda functions, including aliases and invocation URIs, SQS queues, Step Functions state machines, EventBridge buses, Kinesis streams, and load balancers behind VPC links), labelled with the routes that use them, and to the Lambda functions behind its lambda authorizers. Stages link the API to their access log group. Integration and authorizer credentials roles are reported for IAM edges.
