---
"@infrascan/aws-ram-scanner": minor
---

Add a standalone scanner for AWS Resource Access Manager. It records owned resource shares with their principals and resources, `shared-with` edges to account and Organizations principals, and a status node per account and region with a compact list of incoming shares. All nodes are informational, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
