---
"@infrascan/aws-guardduty-scanner": minor
---

Add a standalone scanner for Amazon GuardDuty. It records one informational status node per account and region: enabled, disabled or unknown, detector features, the administrator account, and on the delegated administrator the organization auto-enable settings, members and finding export destinations. A failed status call is reported as unknown, never disabled. No findings or statistics are fetched, and the scanner is not registered by `@infrascan/aws`.
