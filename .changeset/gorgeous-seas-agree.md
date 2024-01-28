---
"@infrascan/aws-ec2-scanner": patch
"@infrascan/core": patch
"@infrascan/sdk": patch
---

Add account prefix to region nodes to avoid cross account conflicts. Use common API for formatting nodes in EC2 to prevent orphaned VPC nodes.
