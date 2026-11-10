---
"@infrascan/aws-cloudformation-scanner": minor
---

Add a standalone scanner for AWS CloudFormation StackSets. It records Organizations access status, stack sets listed as SELF and as DELEGATED_ADMIN with their permission model, auto-deployment, OU ids and regions, and `deploys-to` edges to each account with stack instances. Template bodies and parameters are never stored. All nodes are informational, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
