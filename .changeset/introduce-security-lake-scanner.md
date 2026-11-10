---
"@infrascan/aws-security-lake-scanner": minor
---

Add a standalone scanner for Amazon Security Lake. It records one informational status node per account and region: whether a data lake exists there, its bucket, encryption, lifecycle and replication settings, log sources, organization auto-enable and subscribers. The subscriber external id is dropped before state is written. A failed status call is reported as unknown, never disabled, and the scanner is not registered by `@infrascan/aws`.
