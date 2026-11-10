---
"@infrascan/aws-inspector-scanner": minor
---

Add a standalone scanner for Amazon Inspector. It records one informational status node per account and region: enabled, disabled or unknown, the per-resource-type scan status, the delegated administrator, and where the account can read them the organization auto-enable settings and members. A failed status call is reported as unknown, never disabled. No findings or coverage are fetched, and the scanner is not registered by `@infrascan/aws`.
