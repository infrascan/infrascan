---
"@infrascan/aws-api-gateway-scanner": minor
---

Authorizers are scanned (`GetAuthorizers`) and graphed as informational nodes beneath their API. Each API links to the Lambda functions behind the lambda authorizers its routes use, and authorizer credentials roles are reported for IAM edges.
