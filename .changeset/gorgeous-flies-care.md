---
"@infrascan/aws-ecs-scanner": patch
---

**Note: potentially breaking**

Move load balancer type under ecs service object as it is not a truly generic load balancer type.

Previously configured load balancers for an ECS Service would be tracked on the service node at the top level (i.e. `node.loadBalancer`).
The `loadBalancer` value contained ECS specific information, and was not linked with the LB in front of the service outside of a target group arn.

To correct this, the `loadBalancer` property is now under the ecs service object (i.e. `node.ecs.service.loadBalancer`).
