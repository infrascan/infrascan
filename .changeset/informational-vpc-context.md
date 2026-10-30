---
"@infrascan/informational-serializer": minor
"@infrascan/cli": patch
---

Enrich informational graph output with network context. Nodes placed in a VPC get a `networkContext` that resolves their VPC, subnet and security group ids against the graph: CIDRs, AZs, names and tags, default flags, NAT gateways, and summarised inbound rules. Ids that can't be resolved are kept and marked `resolved: false`. VPC, subnet and security group nodes list the resources placed in them under `networkMembers`. All enrichment is on by default and can be turned off through a new optional `options` argument to `serializeGraph`. Serialization also no longer deep-clones the whole graph for every node.
