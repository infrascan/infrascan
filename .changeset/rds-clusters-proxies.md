---
"@infrascan/aws-rds-scanner": minor
---

Scan RDS DB clusters, DB subnet groups, RDS Proxies (and their targets), and Aurora global clusters. Adds DB cluster, proxy and global cluster nodes, plus cluster → member instance, proxy → target cluster/instance, and global cluster → regional cluster edges. Instances that belong to a cluster are now nested under the cluster node (previously their parent referenced the cluster identifier, which didn't match any node), and instances without a `DBName` are labelled with their identifier.
