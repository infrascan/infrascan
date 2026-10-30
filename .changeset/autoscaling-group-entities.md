---
"@infrascan/aws-autoscaling-scanner": minor
---

Add an Auto Scaling group entity and edges so Auto Scaling groups appear in the graph. Groups are now scanned with pagination, along with their scaling policies (`DescribePolicies`) and lifecycle hooks (`DescribeLifecycleHooks`). Edges are drawn from each group to its launch templates, from load balancers to the groups registered in their target groups, and from each group to the SNS topics or SQS queues targeted by its lifecycle hooks.
