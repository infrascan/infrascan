---
"@infrascan/aws-control-tower-scanner": minor
---

Add a standalone scanner for AWS Control Tower. It records the landing zone (version, status, drift, the raw manifest, governed regions and the log archive and audit accounts), enabled baselines, and one node per target holding its enabled controls, with edges to the log archive and audit accounts and to each OU or account a baseline or control set is enabled on. All nodes are informational, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
