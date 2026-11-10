---
"@infrascan/aws-firewall-manager-scanner": minor
---

Add a standalone scanner for AWS Firewall Manager. It records admin accounts and their scope, policies with their include and exclude maps, `includes` and `excludes` edges to accounts, and a status node per account and region with the administrator. No compliance or violation data is fetched, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
