---
"@infrascan/aws-detective-scanner": minor
---

Add a standalone scanner for Amazon Detective. It records one informational status node per account and region: enabled, disabled or unknown, the behavior graphs the account administers (members, organization auto-enable, data source packages) and the graphs it is a member of, with their administrator. A failed status call is reported as unknown, never disabled. No investigations or indicators are fetched, and the scanner is not registered by `@infrascan/aws`.
