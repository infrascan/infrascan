---
"@infrascan/aws-ec2-scanner": minor
---

Record more network facts as AWS reports them:

- Subnets: `subnet.subnetId`, `vpcId`, `availabilityZoneId`, `ownerId` and `customerOwnedIpv4Pool` (no longer listed as a `cidrBlock` in `network.reservedAddresses`), plus `subnet.routeTable` (`{ id, associationId?, main, implicit }`, `implicit` when the VPC's main route table applies) and `subnet.networkAcl` (`{ id, associationId, isDefault }`), joined from the route table and network ACL state and left out when that state is missing.
- Network interfaces: `operator`, `ipOwnerId`, every private IPv4 address (`privateIpAddresses`, with its public association), `ipv6Addresses` (also in `network.assignedAddresses.ipv6`), and `owner` (`{ type, id }`) when a NAT gateway or VPC endpoint lists the interface or the attachment names an instance.
- VPC endpoints: `serviceNetworkArn`, `resourceConfigurationArn`, `serviceRegion`, `lastError`, `failureReason`, `ipv4Prefixes` and `ipv6Prefixes`.
- VPCs no longer list the primary CIDR block twice in `network.reservedAddresses`.
- `GetManagedPrefixListEntries` is now a hand-written getter. It fetches entries for every customer managed prefix list and for every AWS managed list that a scanned route table route or security group rule (ingress or egress) references, so those AWS managed lists (e.g. S3, DynamoDB, CloudFront origin-facing) carry their entries. Lists are fetched once each in id order, each page with its own parameters, and a failure for one list does not stop the others.
- `DescribeSubnets` now sends a proper `vpc-id` filter; the previous bare VPC id was dropped by the SDK, so every call returned every subnet.

Tag shape changes: NAT gateway and network interface `tags` are now `{ key, value }` (previously `{ key, val }`), and are left out rather than `[]` when there are none. Launch template `tags` are now the template's own tags from `DescribeLaunchTemplates`; the `TagSpecifications` in the launch data (tags for launched resources, previously flattened into `tags` as `{ key: "<resourceType>:<key>", val }`) move to a new `launchTemplate` component as `tagSpecifications: [{ resourceType, tags: [{ key, value }] }]`, next to the template id, name, version number, version description and default-version flag.
