import { Graph } from "@infrascan/core";
import type { BaseState, Graph as GraphType } from "@infrascan/shared-types";
import t from "tap";
import { serializeGraph } from "./index";
import type {
  Node,
  ResolvedSecurityGroup,
  ResolvedSubnet,
  ResolvedVpc,
} from "./index";

const ACCOUNT = "123456789012";
const REGION = "eu-west-1";
const REGION_NODE = `${ACCOUNT}-${REGION}`;
const VPC_ID = "vpc-0a1b2c3d";
const SUBNET_A = "subnet-0aaa";
const SUBNET_B = "subnet-0bbb";
const SUBNET_A_ARN = `arn:aws:ec2:${REGION}:${ACCOUNT}:subnet/${SUBNET_A}`;
const SUBNET_B_ARN = `arn:aws:ec2:${REGION}:${ACCOUNT}:subnet/${SUBNET_B}`;
const SG_APP = "sg-0app";
const SG_DB = "sg-0db";
const NAT_ID = "nat-0123";
const ENI_ID = "eni-0123";
const LAMBDA_ARN = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:api`;
const RDS_ARN = `arn:aws:rds:${REGION}:${ACCOUNT}:cluster:db`;
const ECS_CLUSTER_ARN = `arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/main`;
const ECS_SERVICE_ARN = `arn:aws:ecs:${REGION}:${ACCOUNT}:service/main/web`;
const BUCKET_ARN = "arn:aws:s3:::assets";

function baseNode(
  id: string,
  nodeType: string,
  parent: string | undefined,
  extra: Record<string, unknown> = {},
): BaseState {
  return {
    $metadata: { version: "0.1.0", timestamp: 1 },
    $graph: {
      id,
      label: id,
      nodeType,
      nodeClass: "informational",
      parent,
    },
    tenant: { provider: "aws", tenantId: ACCOUNT },
    resource: { id, name: id, category: nodeType },
    ...extra,
  } as BaseState;
}

function buildGraph(): GraphType {
  const graph = Graph();
  graph.addNode(baseNode(ACCOUNT, "AWS-Account", undefined));
  graph.addNode(baseNode(REGION_NODE, "AWS-Region", ACCOUNT));
  graph.addNode(
    baseNode(VPC_ID, "ec2-vpc", REGION_NODE, {
      tags: [{ key: "Name", value: "prod" }],
      vpc: { isDefault: false, state: "available" },
      network: {
        reservedAddresses: [
          { family: "ipv4", cidrBlock: "10.0.0.0/16" },
          // DescribeVpcs repeats the primary CIDR in the association set
          { family: "ipv4", cidrBlock: "10.0.0.0/16" },
          { family: "ipv6", cidrBlock: "2001:db8::/56" },
        ],
      },
    }),
  );
  graph.addNode(
    baseNode(SUBNET_A_ARN, "ec2-subnet", REGION_NODE, {
      resource: {
        id: SUBNET_A_ARN,
        name: SUBNET_A,
        category: "ec2",
        subcategory: "subnet",
      },
      location: { code: REGION, zone: ["eu-west-1a"] },
      tags: [
        { key: "tier", value: "public" },
        { key: "Name", value: "public-a" },
      ],
      subnet: {
        state: "available",
        isDefault: false,
        onLaunch: { publicIp: true },
      },
      network: {
        reservedAddresses: [{ family: "ipv4", cidrBlock: "10.0.0.0/24" }],
        vpc: { id: VPC_ID },
        subnet: { availableAddressCount: 250 },
      },
    }),
  );
  graph.addNode(
    baseNode(SUBNET_B_ARN, "ec2-subnet", REGION_NODE, {
      resource: {
        id: SUBNET_B_ARN,
        name: SUBNET_B,
        category: "ec2",
        subcategory: "subnet",
      },
      location: { code: REGION, zone: ["eu-west-1b"] },
      subnet: { onLaunch: { publicIp: false } },
      network: {
        reservedAddresses: [{ family: "ipv4", cidrBlock: "10.0.1.0/24" }],
        vpc: { id: VPC_ID },
        subnet: { availableAddressCount: 200 },
      },
    }),
  );
  graph.addNode(
    baseNode(SG_APP, "ec2-security-group", REGION_NODE, {
      resource: {
        id: SG_APP,
        name: "app",
        description: "Application tier",
        category: "ec2",
      },
      network: {
        vpc: { id: VPC_ID },
        rules: [
          {
            fromPort: 443,
            toPort: 443,
            protocol: "tcp",
            permittedIpRanges: [
              { family: "ipv4", cidrBlock: "0.0.0.0/0", description: "web" },
            ],
            awsConfig: {},
          },
        ],
      },
    }),
  );
  graph.addNode(
    baseNode(SG_DB, "ec2-security-group", REGION_NODE, {
      resource: { id: SG_DB, name: "db", category: "ec2" },
      network: {
        vpc: { id: VPC_ID },
        rules: [
          {
            fromPort: 5432,
            toPort: 5432,
            protocol: "tcp",
            permittedIpRanges: [],
            awsConfig: {
              referencedSecurityGroups: [
                { securityGroupId: SG_APP, referencedAccountId: ACCOUNT },
              ],
            },
          },
          { protocol: "ALL", permittedIpRanges: [] },
        ],
      },
    }),
  );
  graph.addNode(
    baseNode(NAT_ID, "ec2-nat-gateway", VPC_ID, {
      tags: [{ key: "Name", val: "nat-a" }],
      network: {
        targetSubnets: [SUBNET_A],
        assignedAddresses: { ipv4: "10.0.0.10" },
        publicIp: { status: "enabled", address: "203.0.113.10" },
        vpc: { id: VPC_ID },
      },
    }),
  );
  graph.addNode(
    baseNode(ENI_ID, "ec2-network-interface", VPC_ID, {
      network: {
        targetSubnets: [SUBNET_B],
        vpc: { id: VPC_ID },
        securityGroups: [SG_DB],
      },
    }),
  );
  graph.addNode(
    baseNode(LAMBDA_ARN, "lambda-function", REGION_NODE, {
      network: {
        vpc: { id: VPC_ID },
        targetSubnets: [SUBNET_A, "subnet-0missing", SUBNET_A],
        securityGroups: [SG_APP, "sg-0missing"],
      },
    }),
  );
  graph.addNode(
    baseNode(RDS_ARN, "rds-cluster", REGION_NODE, {
      network: {
        publicIp: { status: "disabled" },
        vpc: { id: "vpc-0other" },
        securityGroups: [SG_DB],
        targetSubnets: [],
      },
    }),
  );
  graph.addNode(baseNode(ECS_CLUSTER_ARN, "ecs-cluster", REGION_NODE));
  graph.addNode(
    baseNode(ECS_SERVICE_ARN, "ecs-service", ECS_CLUSTER_ARN, {
      network: {
        publicIp: { status: "disabled" },
        targetSubnets: [SUBNET_B],
        securityGroups: [SG_APP],
      },
    }),
  );
  graph.addNode(baseNode(BUCKET_ARN, "s3-bucket", ACCOUNT));
  graph.addEdge({
    source: LAMBDA_ARN,
    target: BUCKET_ARN,
    name: "reads",
    metadata: {},
  });
  return graph;
}

function findNode(nodes: Node[], id: string): Node {
  const node = nodes.find((candidate) => candidate.$graph.id === id);
  if (node == null) throw new Error(`Node ${id} missing from output`);
  return node;
}

t.test("resolves VPC, subnet and security group references", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  const lambda = findNode(nodes, LAMBDA_ARN);
  const context = lambda.networkContext!;

  tap.strictSame(context.vpc, {
    id: VPC_ID,
    nodeId: VPC_ID,
    resolved: true,
    name: "prod",
    cidrBlocks: [
      { family: "ipv4", cidrBlock: "10.0.0.0/16" },
      { family: "ipv6", cidrBlock: "2001:db8::/56" },
    ],
    isDefault: false,
    state: "available",
    tags: { Name: "prod" },
  } satisfies ResolvedVpc);

  // source order is kept, duplicates are removed
  tap.strictSame(
    context.subnets.map(({ id }) => id),
    [SUBNET_A, "subnet-0missing"],
  );
  tap.strictSame(context.subnets[0], {
    id: SUBNET_A,
    nodeId: SUBNET_A_ARN,
    resolved: true,
    name: "public-a",
    cidrBlocks: [{ family: "ipv4", cidrBlock: "10.0.0.0/24" }],
    availabilityZone: "eu-west-1a",
    vpcId: VPC_ID,
    mapPublicIpOnLaunch: true,
    defaultForAz: false,
    availableIpAddressCount: 250,
    state: "available",
    natGateways: [
      {
        id: NAT_ID,
        name: "nat-a",
        publicIp: "203.0.113.10",
        privateIp: "10.0.0.10",
      },
    ],
    tags: { Name: "public-a", tier: "public" },
  } satisfies ResolvedSubnet);

  tap.strictSame(context.securityGroups[0], {
    id: SG_APP,
    nodeId: SG_APP,
    resolved: true,
    name: "app",
    description: "Application tier",
    vpcId: VPC_ID,
    inboundRules: [
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        ports: "443",
        peers: [{ type: "cidr", value: "0.0.0.0/0", description: "web" }],
      },
    ],
  } satisfies ResolvedSecurityGroup);
  tap.end();
});

t.test("summarises security group references and all-traffic rules", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  const eni = findNode(nodes, ENI_ID);
  const [dbGroup] = eni.networkContext!.securityGroups;
  tap.ok(dbGroup.resolved);
  tap.strictSame((dbGroup as ResolvedSecurityGroup).inboundRules, [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      ports: "5432",
      peers: [{ type: "security-group", value: SG_APP, accountId: ACCOUNT }],
    },
    { protocol: "ALL", ports: "all", peers: [] },
  ]);
  tap.end();
});

t.test("keeps unresolvable ids and marks them unresolved", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  const lambda = findNode(nodes, LAMBDA_ARN);
  tap.strictSame(lambda.networkContext!.subnets[1], {
    id: "subnet-0missing",
    resolved: false,
  });
  tap.strictSame(lambda.networkContext!.securityGroups[1], {
    id: "sg-0missing",
    resolved: false,
  });
  const rds = findNode(nodes, RDS_ARN);
  tap.strictSame(rds.networkContext!.vpc, {
    id: "vpc-0other",
    resolved: false,
  });
  // the raw network component is untouched
  tap.strictSame(rds.network?.securityGroups, [SG_DB]);
  tap.end();
});

t.test("infers the VPC for nodes which only reference subnets", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  const service = findNode(nodes, ECS_SERVICE_ARN);
  tap.equal(service.networkContext!.vpc?.id, VPC_ID);
  tap.equal(service.networkContext!.vpc?.inferred, true);
  tap.equal(service.networkContext!.vpc?.resolved, true);
  tap.end();
});

t.test("does not infer a subnet's VPC from nodes which reference it", (tap) => {
  const graph = Graph();
  graph.addNode(baseNode(VPC_ID, "ec2-vpc", undefined));
  graph.addNode(
    baseNode(SUBNET_A_ARN, "ec2-subnet", undefined, {
      resource: { id: SUBNET_A_ARN, name: SUBNET_A, category: "ec2" },
    }),
  );
  graph.addNode(
    baseNode(LAMBDA_ARN, "lambda-function", undefined, {
      network: { vpc: { id: VPC_ID }, targetSubnets: [SUBNET_A] },
    }),
  );
  graph.addNode(
    baseNode(ECS_SERVICE_ARN, "ecs-service", undefined, {
      network: { targetSubnets: [SUBNET_A] },
    }),
  );
  const { nodes } = serializeGraph(graph);
  const subnet = findNode(nodes, LAMBDA_ARN).networkContext!
    .subnets[0] as ResolvedSubnet;
  tap.equal(subnet.resolved, true);
  tap.equal(subnet.vpcId, undefined);
  tap.equal(findNode(nodes, ECS_SERVICE_ARN).networkContext!.vpc, undefined);
  tap.end();
});

t.test("omits the derived VPC when subnets record different VPCs", (tap) => {
  const graph = Graph();
  graph.addNode(baseNode(VPC_ID, "ec2-vpc", undefined));
  graph.addNode(baseNode("vpc-0other", "ec2-vpc", undefined));
  graph.addNode(
    baseNode(SUBNET_A_ARN, "ec2-subnet", undefined, {
      resource: { id: SUBNET_A_ARN, name: SUBNET_A, category: "ec2" },
      network: { vpc: { id: VPC_ID } },
    }),
  );
  graph.addNode(
    baseNode(SUBNET_B_ARN, "ec2-subnet", undefined, {
      resource: { id: SUBNET_B_ARN, name: SUBNET_B, category: "ec2" },
      network: { vpc: { id: "vpc-0other" } },
    }),
  );
  graph.addNode(
    baseNode(ECS_SERVICE_ARN, "ecs-service", undefined, {
      network: { targetSubnets: [SUBNET_A, SUBNET_B] },
    }),
  );
  const { nodes } = serializeGraph(graph);
  tap.equal(findNode(nodes, ECS_SERVICE_ARN).networkContext!.vpc, undefined);
  tap.end();
});

t.test("adds a reverse view to network nodes", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  tap.strictSame(findNode(nodes, VPC_ID).networkMembers, [
    SUBNET_A_ARN,
    SUBNET_B_ARN,
    ECS_SERVICE_ARN,
    LAMBDA_ARN,
    ENI_ID,
    NAT_ID,
    SG_APP,
    SG_DB,
  ]);
  tap.strictSame(findNode(nodes, SUBNET_A_ARN).networkMembers, [
    LAMBDA_ARN,
    NAT_ID,
  ]);
  tap.strictSame(findNode(nodes, SG_DB).networkMembers, [RDS_ARN, ENI_ID]);
  tap.equal(findNode(nodes, BUCKET_ARN).networkMembers, undefined);
  tap.end();
});

t.test("leaves nodes without a network component unchanged", (tap) => {
  const graph = buildGraph();
  const { nodes, edges } = serializeGraph(graph);
  const bucket = findNode(nodes, BUCKET_ARN);
  tap.strictSame(bucket, baseNode(BUCKET_ARN, "s3-bucket", ACCOUNT));
  tap.equal(bucket.networkContext, undefined);
  tap.strictSame(edges, [
    {
      id: `${LAMBDA_ARN}-${BUCKET_ARN}`,
      name: "reads",
      source: LAMBDA_ARN,
      target: BUCKET_ARN,
      metadata: {},
    },
  ]);
  tap.end();
});

t.test("does not mutate the input graph", (tap) => {
  const graph = buildGraph();
  const before = graph.nodes.map(({ $graph, network, resource }) =>
    structuredClone({ $graph, network, resource }),
  );
  const result = serializeGraph(graph);
  // mutating the output must not leak back into the graph either
  result.nodes.forEach((node) => {
    // eslint-disable-next-line no-param-reassign
    node.$graph.label = "changed";
  });
  const after = graph.nodes.map(({ $graph, network, resource }) =>
    structuredClone({ $graph, network, resource }),
  );
  tap.strictSame(after, before);
  graph.nodes.forEach((node) => {
    tap.notOk("networkContext" in node);
  });
  tap.equal(graph.getNode(LAMBDA_ARN)?.parent?.$graph.id, REGION_NODE);
  tap.end();
});

t.test("is deterministic and JSON serializable", (tap) => {
  const first = JSON.stringify(serializeGraph(buildGraph()));
  const second = JSON.stringify(serializeGraph(buildGraph()));
  tap.equal(first, second);
  tap.strictSame(
    JSON.parse(first).nodes.map((node: Node) => node.$graph.id),
    buildGraph().nodes.map((node) => node.$graph.id),
  );
  tap.end();
});

t.test("enrichment can be disabled via options", (tap) => {
  const graph = buildGraph();
  const { nodes } = serializeGraph(graph, {
    networkContext: false,
    networkMembers: false,
  });
  nodes.forEach((node) => {
    tap.notOk("networkContext" in node);
    tap.notOk("networkMembers" in node);
  });

  const membersOnly = serializeGraph(graph, { networkContext: false });
  tap.equal(findNode(membersOnly.nodes, LAMBDA_ARN).networkContext, undefined);
  tap.ok(findNode(membersOnly.nodes, VPC_ID).networkMembers);
  tap.end();
});

t.test("resolves launch template interfaces and prefix lists", (tap) => {
  const graph = buildGraph();
  graph.addNode(
    baseNode("sg-0pl", "ec2-security-group", REGION_NODE, {
      resource: { id: "sg-0pl", name: "pl", category: "ec2" },
      network: {
        rules: [
          {
            fromPort: 1024,
            toPort: 65000,
            protocol: "udp",
            awsConfig: { prefixLists: [{ prefixListId: "pl-0123" }] },
          },
        ],
      },
    }),
  );
  graph.addNode(
    baseNode("lt-0123", "ec2-launch-template", REGION_NODE, {
      network: {
        securityGroups: ["sg-0pl"],
        interfaces: [{ subnetId: SUBNET_B, groups: [SG_APP, "sg-0pl"] }],
      },
    }),
  );
  const { nodes } = serializeGraph(graph);
  const context = findNode(nodes, "lt-0123").networkContext!;
  tap.strictSame(
    context.securityGroups.map(({ id }) => id),
    ["sg-0pl", SG_APP],
  );
  tap.strictSame(
    context.subnets.map(({ id }) => id),
    [SUBNET_B],
  );
  tap.equal(context.vpc?.id, VPC_ID);
  tap.strictSame(
    (context.securityGroups[0] as ResolvedSecurityGroup).inboundRules,
    [
      {
        protocol: "udp",
        fromPort: 1024,
        toPort: 65000,
        ports: "1024-65000",
        peers: [{ type: "prefix-list", value: "pl-0123" }],
      },
    ],
  );
  tap.end();
});
