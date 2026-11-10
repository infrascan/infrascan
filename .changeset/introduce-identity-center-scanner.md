---
"@infrascan/aws-identity-center-scanner": minor
---

Add a standalone scanner for AWS IAM Identity Center. It records instances with their owner account, permission sets with their managed and customer managed policy references, `provisioned-to` edges to accounts, and a status node per account and region. Inline policy content, assignments, users and groups are not fetched. All nodes are informational, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
