---
"@infrascan/aws-macie-scanner": minor
---

Add a standalone scanner for Amazon Macie. It records one informational status node per account and region: enabled, disabled or unknown, the administrator account, the classification export destination, the automated discovery status, and where the account can read them the organization auto-enable settings and members. Macie's "not enabled" access-denied error is recorded as disabled; any other failed status call is unknown. No findings or jobs are fetched, and the scanner is not registered by `@infrascan/aws`.
