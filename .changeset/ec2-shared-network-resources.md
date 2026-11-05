---
"@infrascan/aws-ec2-scanner": minor
---

Map transit gateways, transit gateway attachments, VPC peering connections and managed prefix lists that several scanned accounts or regions report (RAM shared, cross-account, cross-region, and AWS managed prefix lists, whose id is the same in every account) to one node each. `tenant.tenantId` now comes from the AWS owner field (`OwnerId`, `ResourceOwnerId`, the peering requester's `OwnerId`, `AWS` for AWS managed lists) instead of the scanning account. The node sits under the owner's region when the owner's account and region were scanned, and is otherwise a root node with no parent; AWS managed prefix lists are always root nodes. Previously the second copy was dropped as a node conflict and the survivor's tenant and parent depended on scan order. Transit gateway peering attachments are now keyed `<attachment id>:<transit gateway id>`, one node per end, with the attachment id in `transitGatewayAttachment.attachmentId`.
