---
"@infrascan/aws-account-scanner": minor
---

Add a standalone scanner for AWS Account Management. It records one informational node per account with region opt-in status and whether the security, billing and operations alternate contacts are set. Contact details are never stored. Failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
