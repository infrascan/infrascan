---
"@infrascan/core": patch
"@infrascan/sdk": patch
"@infrascan/aws-dynamodb-scanner": patch
"@infrascan/aws-sns-scanner": patch
"@infrascan/aws-route53-scanner": patch
"@infrascan/aws-ecs-scanner": patch
"@infrascan/aws-lambda-scanner": patch
"@infrascan/aws-eventbridge-scanner": patch
"@infrascan/aws-step-function-scanner": patch
"@infrascan/aws-codegen": patch
---

Fix runtime failures found by fuzzing the scanners against schema-generated AWS responses:

- IAM policy statements using `NotResource` (or with no `Resource`) no longer crash graph generation.
- DynamoDB global table replicas are graphed with their own ARN and name instead of an undefined id, which also crashed IAM edge resolution for wildcard DynamoDB resources.
- A resource that fails to translate is skipped with a warning instead of aborting `generateGraph`; nodes without an id are no longer inserted.
- Edge generation failures are isolated per scanner and per role.
- Roles that select as null (e.g. ECS task definitions without a task role) are no longer returned by `getIamRoles`.
- Unconfirmed/deleted SNS subscriptions (`PendingConfirmation`/`Deleted`) are no longer graphed as colliding nodes.
- Route53 tolerates SNS HTTP endpoints that are not valid URLs.
