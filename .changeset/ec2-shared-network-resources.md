---
"@infrascan/aws-ec2-scanner": minor
---

Map transit gateways, transit gateway attachments and VPC peering connections that several scanned accounts or regions report (RAM shared, cross-account, cross-region) to one node each. `tenant.tenantId` now comes from the AWS owner field (`OwnerId`, `ResourceOwnerId`, the peering requester's `OwnerId`) instead of the scanning account. The node sits under the owner's region when the owner's account and region were scanned, and is otherwise a root node with no parent. Previously the second copy was dropped as a node conflict and the survivor's tenant and parent depended on scan order. Transit gateway peering attachments are now keyed `<attachment id>:<transit gateway id>`, one node per end, with the attachment id in `transitGatewayAttachment.attachmentId`.

Managed prefix list node ids (and `resource.id`) are now `<account id>:<pl-…>` for every list, customer and AWS managed, because AWS managed lists have the same id in every account of a region and customer managed lists can be shared through RAM. Each scanned account gets its own node, with that account as tenant and its region as parent. The `pl-…` id that route tables, security group rules and endpoints reference is in the new `prefixList.prefixListId`.
