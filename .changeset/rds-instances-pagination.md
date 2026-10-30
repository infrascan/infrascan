---
"@infrascan/aws-rds-scanner": patch
---

Paginate `DescribeDBInstances` using `Marker` so accounts with more than one page of DB instances are fully scanned.
