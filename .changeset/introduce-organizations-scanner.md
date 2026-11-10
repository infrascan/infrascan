---
"@infrascan/aws-organizations-scanner": minor
---

Add a standalone scanner for AWS Organizations. It records the organization, its roots, the OU tree, member accounts, policies of every enabled type with their raw documents, direct policy attachments, delegated administrators and trusted service access. All nodes are informational and policies are not evaluated. Failed calls are kept in state with their AWS error, so a member account's denied calls are recorded rather than looking empty. The scanner is not registered by `@infrascan/aws`.
