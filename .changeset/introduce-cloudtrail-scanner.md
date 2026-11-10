---
"@infrascan/aws-cloudtrail-scanner": minor
---

Add a standalone scanner for AWS CloudTrail. Trail nodes are emitted only by the owning account in the trail's home region, event data stores are nodes, and a status node per account and region lists every trail visible there, so a member account's view of an organization trail is recorded. All nodes are informational, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
