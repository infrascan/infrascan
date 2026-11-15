---
"@infrascan/aws-api-gateway-scanner": minor
---

API nodes are keyed by their ARN (`arn:aws:apigateway:{region}::/apis/{apiId}`) instead of their endpoint, so other API Gateway state can be linked to them. The endpoint moves to `apiGateway.endpoint`, nodes are labelled by name, and the API ID, creation date and tags are recorded. `GetApis` and `GetDomainNames` are paginated.
