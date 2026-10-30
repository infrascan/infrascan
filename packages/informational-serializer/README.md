# @infrascan/informational-serializer

A graph serializer for non-visual consumption: LLMs, scripts and other tools that read infrastructure as data. Unlike `@infrascan/cytoscape-serializer`, it keeps every node's scanned components as plain JSON, and adds each node's place in the hierarchy and its resolved network placement.

## Usage

```ts
import Infrascan from "@infrascan/sdk";
import { serializeGraph } from "@infrascan/informational-serializer";

const infrascan = new Infrascan();
const graph = await infrascan.generateGraph(
  scanMetadata,
  connector,
  serializeGraph,
);
```

From the CLI: `infrascan graph --input ./state --serializer informational`.

`serializeGraph(graph, options?)` takes an optional second argument. Every flag defaults to `true`:

| Option           | Adds                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `networkContext` | `networkContext` on nodes whose `network` component references a VPC, subnet or SG |
| `hierarchy`      | `parent` and `ancestry` on every node                                              |
| `networkMembers` | `networkMembers` on VPC, subnet and security group nodes                           |

```ts
// The output from before version 0.3.0: scanned components only
serializeGraph(graph, {
  networkContext: false,
  hierarchy: false,
  networkMembers: false,
});
```

The input graph is never mutated, and the output is deterministic for a given graph.

## Output format

```ts
interface InformationalGraph {
  nodes: Node[]; // in graph insertion order
  edges: { id; name?; source: string; target: string; metadata }[];
}
```

Each node is a copy of its scanned state (`$graph`, `resource`, `tenant`, `location`, `network`, `tags`, and any service specific components) without the graph's object references (`incomingEdges`, `outgoingEdges`, `children`). The serializer adds:

- `parent`: the id of the node's parent in the graph.
- `ancestry`: the ids of the node's ancestors, root first, excluding the node itself. For example `["123456789012", "123456789012-eu-west-1"]` for a Lambda, or `[account, region, "vpc-0a1b"]` for a NAT gateway or network interface. VPC placement for other resources lives in `networkContext`, not here, because the graph doesn't parent those resources under their VPC.
- `networkContext`: the node's raw `network` ids resolved against the VPC, subnet, security group and NAT gateway nodes in the graph. The `network` component itself is left unchanged.
  - `vpc`: id, `name` (the `Name` tag, falling back to the resource name), `cidrBlocks`, `isDefault`, `state` and `tags`. When the node references no VPC directly (for example ECS services or Auto Scaling groups), the VPC is taken from the VPC recorded on its subnets and security groups and marked `inferred: true`. It is omitted if they record different VPCs.
  - `subnets`: id (`subnet-...`), `nodeId` (the subnet's ARN, its graph id), `name`, `cidrBlocks`, `availabilityZone`, `vpcId` (as recorded by the subnet), `mapPublicIpOnLaunch`, `defaultForAz`, `availableIpAddressCount`, `state`, `tags`, and the `natGateways` deployed in the subnet.
  - `securityGroups`: id, `name` (the group name), `description`, `vpcId` (as recorded by the group) and `inboundRules`. Each rule has `protocol`, `fromPort`, `toPort`, a readable `ports` (`"443"`, `"1024-65535"` or `"all"`) and `peers`: CIDR ranges, referenced security groups and prefix lists.
  - Ids that don't match a node in the graph are kept as `{ "id": "subnet-...", "resolved": false }`. They are never dropped.
- `networkMembers`: only on VPC, subnet and security group nodes. Lists the sorted ids of the nodes whose `networkContext` resolves to that node. A VPC's members include its subnets and security groups, which record their VPC in `network.vpc.id`.

Example (abridged):

```json
{
  "$graph": {
    "id": "arn:aws:lambda:eu-west-1:123456789012:function:api",
    "nodeType": "lambda-function",
    "parent": "123456789012-eu-west-1"
  },
  "network": {
    "vpc": { "id": "vpc-0a1b" },
    "targetSubnets": ["subnet-0aaa", "subnet-0gone"],
    "securityGroups": ["sg-0app"]
  },
  "parent": "123456789012-eu-west-1",
  "ancestry": ["123456789012", "123456789012-eu-west-1"],
  "networkContext": {
    "vpc": {
      "id": "vpc-0a1b",
      "nodeId": "vpc-0a1b",
      "resolved": true,
      "name": "prod",
      "cidrBlocks": [{ "family": "ipv4", "cidrBlock": "10.0.0.0/16" }],
      "isDefault": false,
      "tags": { "Name": "prod" }
    },
    "subnets": [
      {
        "id": "subnet-0aaa",
        "nodeId": "arn:aws:ec2:eu-west-1:123456789012:subnet/subnet-0aaa",
        "resolved": true,
        "name": "private-a",
        "cidrBlocks": [{ "family": "ipv4", "cidrBlock": "10.0.1.0/24" }],
        "availabilityZone": "eu-west-1a",
        "vpcId": "vpc-0a1b",
        "mapPublicIpOnLaunch": false,
        "availableIpAddressCount": 249,
        "natGateways": [
          {
            "id": "nat-0123",
            "name": "nat-0123",
            "publicIp": "203.0.113.10",
            "privateIp": "10.0.1.10"
          }
        ],
        "tags": { "Name": "private-a" }
      },
      { "id": "subnet-0gone", "resolved": false }
    ],
    "securityGroups": [
      {
        "id": "sg-0app",
        "nodeId": "sg-0app",
        "resolved": true,
        "name": "app",
        "description": "App tier",
        "vpcId": "vpc-0a1b",
        "inboundRules": [
          {
            "protocol": "tcp",
            "fromPort": 443,
            "toPort": 443,
            "ports": "443",
            "peers": [{ "type": "cidr", "value": "10.0.0.0/16" }]
          }
        ]
      }
    ]
  }
}
```

## Limitations

The serializer only uses data that is already in the graph, so some network details are missing:

- **Subnet and security group VPC ids need a recent EC2 scanner.** They are read from `network.vpc.id`, which older versions of `@infrascan/aws-ec2-scanner` didn't record. With state from those versions, `vpcId` is omitted and no VPC is derived for nodes that only reference subnets or security groups.
- **There is no public/private subnet classification.** Route tables and internet gateways aren't scanned, so only `mapPublicIpOnLaunch` and any NAT gateways in the subnet are reported.
- **Security group egress rules are missing.** Only inbound rules are scanned.
- **EC2 instances aren't scanned**, so they don't appear as members of subnets or security groups.
