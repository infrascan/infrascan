# @infrascan/aws-ec2-scanner

A scanner module for AWS EC2, designed to be used with the [@infrascan/sdk](../../packages/sdk).

This module pulls information about the EC2 networking resources in an AWS account (VPCs, subnets, security groups, launch templates, network interfaces and NAT gateways), along with the routing, gateway, endpoint, NACL, peering, transit gateway, DNS/DHCP, flow log and Elastic IP state needed to describe each VPC and subnet's network context.

## IAM permissions

The scanner only calls read-only APIs. It needs:

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:DescribeVpcs",
    "ec2:DescribeVpcAttribute",
    "ec2:DescribeSubnets",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeLaunchTemplates",
    "ec2:DescribeLaunchTemplateVersions",
    "ec2:DescribeNetworkInterfaces",
    "ec2:DescribeNatGateways",
    "ec2:DescribeRouteTables",
    "ec2:DescribeInternetGateways",
    "ec2:DescribeEgressOnlyInternetGateways",
    "ec2:DescribeVpcEndpoints",
    "ec2:DescribeNetworkAcls",
    "ec2:DescribeVpcPeeringConnections",
    "ec2:DescribeTransitGateways",
    "ec2:DescribeTransitGatewayAttachments",
    "ec2:DescribeVpnGateways",
    "ec2:DescribeManagedPrefixLists",
    "ec2:GetManagedPrefixListEntries",
    "ec2:DescribeDhcpOptions",
    "ec2:DescribeFlowLogs",
    "ec2:DescribeAddresses"
  ],
  "Resource": "*"
}
```

Every permission from `DescribeVpcAttribute` onwards is used for network context only. If one is missing the scan still completes and the affected part of the context is reported as unknown/unresolved rather than guessed. `GetManagedPrefixListEntries` is only called for customer managed prefix lists (bounded by their `MaxEntries`); AWS managed lists are identified by name.

## Network context

No extra graph nodes or edges are created for route tables, gateways, endpoints, NACLs etc. They are described on the existing nodes:

| Node | Component | Contents |
| --- | --- | --- |
| `ec2-vpc` | `networkContext` | CIDRs, DNS attributes, DHCP options, main route table, every route table (associations, routes), a per-subnet summary (route table, NACL, tier), internet / egress-only internet gateways, NAT gateways, VPC endpoints (policy summarized, not copied), peering connections, transit gateway attachments, VPN gateways, flow logs, Elastic IPs and the managed prefix lists referenced by routes, gateway endpoints and security group rules |
| `ec2-vpc` | `vpc` | Now also sets `enableDnsSupport` / `enableDnsHostnames` |
| `ec2-subnet` | `networkContext` | Effective route table (`association: explicit` or inherited `main`) with every route resolved to a typed hop, `tier` / `ipv6Tier` and the `tierBasis` they were derived from, the `defaultEgress` path for IPv4 and IPv6, `privateServiceAccess`, the NACL in effect, flow logs and referenced prefix lists |
| `ec2-security-group` | `network.egressRules` | Outbound rules, same shape as the existing inbound `network.rules` |
| `ec2-network-interface` | `networkInterface` | Interface type, status, requester managed/id, description, attachment, Elastic IP and the derived `owner` (`ec2_instance`, `nat_gateway`, `vpc_endpoint`, `lambda`, `load_balancer`, `transit_gateway`, `rds`, `efs`, …) |
| `ec2-nat-gateway` | `natGateway` | Connectivity type (`public`/`private`), state, subnet and addresses |

### Ids

Every reference is either a graph node id or described in the same context block. VPC, NAT gateway, network interface and security group nodes are keyed by their bare ids (`vpc-…`, `nat-…`, `eni-…`, `sg-…`). Subnet nodes are keyed by their ARN, so wherever a `subnet-…` id appears in a hop or summary it is accompanied by `subnetNodeId`. Gateways, endpoints, peering connections, transit gateways and prefix lists are not nodes; they are described in the VPC's `networkContext` (and, for a subnet's own routes, inline in `route.target`).

### Routes

Each route is `{ destination, destinationType: ipv4|ipv6|prefix-list, targetType, targetId, state, origin, resolved, targetNodeId?, target? }` where `targetType` is one of `local`, `igw`, `eigw`, `nat`, `tgw`, `pcx`, `vpce`, `eni`, `vgw`, `instance`, `local-gateway`, `carrier-gateway`, `core-network`, `odb-network`, `blackhole` (no target recorded) or `unknown`. A route to a deleted target keeps its target type and has `state: "blackhole"`. On subnet routes `target` carries what's needed to follow the hop: a NAT gateway's subnet, a peering connection's peer VPC/account/region/CIDRs, a transit gateway's ASN and this VPC's attachment, an endpoint's service name, an ENI's owner and subnet. Routes are ordered IPv4, IPv6 then prefix lists, most specific prefix first.

### Derived fields

- `tier` is derived from the target of the `0.0.0.0/0` route in the subnet's effective route table: `igw` → `public`, `nat` → `private-nat`, `tgw` → `private-tgw`, `vgw` → `private-vgw`, `pcx` → `private-pcx`, `eni`/`instance` → `private-appliance`, `vpce` → `private-gwlb-endpoint`, any other target → `private-other`, a blackhole route → `blackhole`, no route → `isolated`, no route table data → `unknown`.
- `ipv6Tier` applies the same rules to `::/0`, with `eigw` → `egress-only`, and is `no-ipv6` when the subnet has no IPv6 CIDR.
- `defaultEgress.ipv4` / `.ipv6` follow the default route hop by hop. A NAT gateway hop continues from the NAT gateway's subnet route table (IPv6 continues as IPv4 after NAT64); appliance ENIs/instances and gateway load balancer endpoints continue from their subnet. The path ends with `status`: `internet` (IGW, or a carrier gateway), `internet-egress-only` (EIGW), `private-network` (TGW, VGW, peering, local gateway, Cloud WAN), `blackhole`, `no-default-route`, `unresolved` (a target missing from the scanned state, or an unattached gateway), `loop` or `unknown` (no route table data). `issues` explains anything that weakens the path (e.g. a private NAT gateway routed to an IGW, source/destination check on an appliance, transit gateway route tables not being scanned).
- `privateServiceAccess.gatewayEndpoints` lists the gateway endpoints routed from the subnet's route table (with the prefix list), `interfaceEndpoints` the interface/GWLB endpoints in the VPC, marked `in-subnet` or `vpc-local-route`.
- `networkAcl` is the explicitly associated NACL, falling back to the VPC default (`association: default-inferred`), with inbound/outbound rules ordered by rule number.

### Not covered

Transit gateway route tables, VPN connections/Direct Connect, Network Firewall rules and route server state are not scanned, so traversal stops at the transit gateway/VPN gateway with `status: private-network`. Subnets shared into the account through RAM may have no visible route table and report `tier: unknown`.

## Quickstart

```javascript
import EC2Scanner from "@infrascan/aws-ec2-scanner";
import Infrascan from "@infrascan/sdk";

const infrascanClient = new Infrascan();
infrascanClient.registerScanner(EC2Scanner);
```

If you plan on scanning all of an AWS account, you should use the [@infrascan/aws](../../packages/aws) package.

## Contributing

The majority of the scanner modules are autogenerated from their [config.ts](./config.ts) file. 

Changes such as adding a new function/endpoint in the service to scan can be done within the config file. 

More significant changes will likely need to take place in the [aws-codegen](../codegen) package.