import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeAddressesCommand,
  DescribeDhcpOptionsCommand,
  DescribeEgressOnlyInternetGatewaysCommand,
  DescribeFlowLogsCommand,
  DescribeInternetGatewaysCommand,
  DescribeManagedPrefixListsCommand,
  DescribeNatGatewaysCommand,
  DescribeNetworkAclsCommand,
  DescribeNetworkInterfacesCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeTransitGatewayAttachmentsCommand,
  DescribeTransitGatewaysCommand,
  DescribeVpcAttributeCommand,
  DescribeVpcEndpointsCommand,
  DescribeVpcPeeringConnectionsCommand,
  DescribeVpcsCommand,
  DescribeVpnGatewaysCommand,
  GetManagedPrefixListEntriesCommand,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import { Graph, generateNodesFromEntity } from "@infrascan/core";
import type { BaseState, Connector } from "@infrascan/shared-types";
import EC2Scanner from ".";
import {
  DhcpOptionsEntity,
  EgressOnlyInternetGatewayEntity,
  ElasticIpEntity,
  FlowLogEntity,
  InternetGatewayEntity,
  ManagedPrefixListEntity,
  NatGatewayEntity,
  NetworkAclEntity,
  NetworkInterfaceEntity,
  RouteTableEntity,
  SecurityGroupEntity,
  TransitGatewayAttachmentEntity,
  TransitGatewayEntity,
  VpcEndpointEntity,
  VpcEntity,
  VpcPeeringConnectionEntity,
  VpnGatewayEntity,
} from "./graph";

const account = "123456789012";
const region = "eu-west-1";
const context = { account, region };
const regionNodeId = `${account}-${region}`;
const vpcId = "vpc-0main";
const publicSubnet = "subnet-0public";
const privateSubnet = "subnet-0private";

function mockScan() {
  const client = EC2Scanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().resolves({});

  mocked
    .on(DescribeVpcsCommand)
    .resolves({ Vpcs: [{ VpcId: vpcId, CidrBlock: "10.0.0.0/16" }] });
  mocked
    .on(DescribeVpcAttributeCommand, {
      VpcId: vpcId,
      Attribute: "enableDnsSupport",
    })
    .resolves({ VpcId: vpcId, EnableDnsSupport: { Value: true } })
    .on(DescribeVpcAttributeCommand, {
      VpcId: vpcId,
      Attribute: "enableDnsHostnames",
    })
    .resolves({ VpcId: vpcId, EnableDnsHostnames: { Value: false } });
  mocked.on(DescribeSubnetsCommand).resolves({
    Subnets: [publicSubnet, privateSubnet].map((subnetId) => ({
      SubnetId: subnetId,
      SubnetArn: `arn:aws:ec2:${region}:${account}:subnet/${subnetId}`,
      VpcId: vpcId,
    })),
  });
  mocked.on(DescribeSecurityGroupsCommand).resolves({
    SecurityGroups: [
      {
        GroupId: "sg-0app",
        GroupName: "app",
        VpcId: vpcId,
        IpPermissions: [
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            IpRanges: [{ CidrIp: "10.0.0.0/16" }],
          },
        ],
        IpPermissionsEgress: [
          { IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            PrefixListIds: [{ PrefixListId: "pl-corp" }],
          },
        ],
      },
    ],
  });
  mocked.on(DescribeNetworkInterfacesCommand).resolves({
    NetworkInterfaces: [
      {
        NetworkInterfaceId: "eni-0nat",
        VpcId: vpcId,
        SubnetId: publicSubnet,
        InterfaceType: "nat_gateway",
        Status: "in-use",
        Description: "Interface for NAT Gateway nat-0main",
        RequesterManaged: true,
        RequesterId: "AWS",
        SourceDestCheck: false,
        Association: {
          AllocationId: "eipalloc-0nat",
          AssociationId: "eipassoc-0nat",
          PublicIp: "54.0.0.1",
        },
      },
    ],
  });
  mocked.on(DescribeNatGatewaysCommand).resolves({
    NatGateways: [
      {
        NatGatewayId: "nat-0main",
        VpcId: vpcId,
        SubnetId: publicSubnet,
        State: "available",
        ConnectivityType: "public",
        NatGatewayAddresses: [
          {
            AllocationId: "eipalloc-0nat",
            NetworkInterfaceId: "eni-0nat",
            PrivateIp: "10.0.0.10",
            PublicIp: "54.0.0.1",
            IsPrimary: true,
          },
        ],
      },
    ],
  });
  mocked
    .on(DescribeRouteTablesCommand, { NextToken: undefined })
    .resolves({
      RouteTables: [
        {
          RouteTableId: "rtb-main",
          VpcId: vpcId,
          Associations: [
            {
              RouteTableAssociationId: "rtbassoc-main",
              Main: true,
              AssociationState: { State: "associated" },
            },
          ],
          PropagatingVgws: [{ GatewayId: "vgw-0onprem" }],
          Routes: [
            {
              DestinationCidrBlock: "10.0.0.0/16",
              GatewayId: "local",
              State: "active",
              Origin: "CreateRouteTable",
            },
            {
              DestinationCidrBlock: "0.0.0.0/0",
              TransitGatewayId: "tgw-0core",
              State: "active",
              Origin: "CreateRoute",
            },
          ],
        },
      ],
      NextToken: "rtb-page-2",
    })
    .on(DescribeRouteTablesCommand, { NextToken: "rtb-page-2" })
    .resolves({
      RouteTables: [
        {
          RouteTableId: "rtb-private",
          VpcId: vpcId,
          Associations: [
            {
              RouteTableAssociationId: "rtbassoc-private",
              SubnetId: privateSubnet,
              Main: false,
            },
          ],
          Routes: [
            {
              DestinationCidrBlock: "0.0.0.0/0",
              NatGatewayId: "nat-0main",
              State: "active",
              Origin: "CreateRoute",
            },
            {
              DestinationPrefixListId: "pl-s3",
              GatewayId: "vpce-0s3",
              State: "active",
              Origin: "CreateRoute",
            },
            {
              DestinationCidrBlock: "192.168.0.0/16",
              State: "blackhole",
              Origin: "CreateRoute",
            },
          ],
        },
      ],
    });
  mocked.on(DescribeInternetGatewaysCommand).resolves({
    InternetGateways: [
      {
        InternetGatewayId: "igw-0main",
        OwnerId: account,
        Attachments: [{ VpcId: vpcId, State: "available" }],
      },
      { InternetGatewayId: "igw-0detached", Attachments: [] },
    ],
  });
  mocked.on(DescribeEgressOnlyInternetGatewaysCommand).resolves({
    EgressOnlyInternetGateways: [
      {
        EgressOnlyInternetGatewayId: "eigw-0main",
        Attachments: [{ VpcId: vpcId, State: "attached" }],
      },
    ],
  });
  mocked.on(DescribeVpcEndpointsCommand).resolves({
    VpcEndpoints: [
      {
        VpcEndpointId: "vpce-0s3",
        VpcEndpointType: "Gateway",
        VpcId: vpcId,
        ServiceName: `com.amazonaws.${region}.s3`,
        State: "available",
        RouteTableIds: ["rtb-private"],
        PolicyDocument: '{"Statement":[]}',
      },
      {
        VpcEndpointId: "vpce-0sqs",
        VpcEndpointType: "Interface",
        VpcId: vpcId,
        ServiceName: `com.amazonaws.${region}.sqs`,
        State: "available",
        SubnetIds: [privateSubnet],
        NetworkInterfaceIds: ["eni-0vpce"],
        Groups: [{ GroupId: "sg-0app", GroupName: "app" }],
        PrivateDnsEnabled: true,
        DnsEntries: [
          {
            DnsName: `vpce-0sqs.sqs.${region}.vpce.amazonaws.com`,
            HostedZoneId: "Z1",
          },
        ],
      },
    ],
  });
  mocked.on(DescribeNetworkAclsCommand).resolves({
    NetworkAcls: [
      {
        NetworkAclId: "acl-0default",
        VpcId: vpcId,
        IsDefault: true,
        Associations: [
          {
            NetworkAclAssociationId: "aclassoc-public",
            NetworkAclId: "acl-0default",
            SubnetId: publicSubnet,
          },
        ],
        Entries: [
          {
            RuleNumber: 100,
            Egress: false,
            RuleAction: "allow",
            Protocol: "6",
            CidrBlock: "0.0.0.0/0",
            PortRange: { From: 443, To: 443 },
          },
          {
            RuleNumber: 32767,
            Egress: false,
            RuleAction: "deny",
            Protocol: "-1",
            CidrBlock: "0.0.0.0/0",
          },
        ],
      },
    ],
  });
  mocked.on(DescribeVpcPeeringConnectionsCommand).resolves({
    VpcPeeringConnections: [
      {
        VpcPeeringConnectionId: "pcx-0peer",
        Status: { Code: "active", Message: "Active" },
        RequesterVpcInfo: {
          VpcId: vpcId,
          OwnerId: account,
          Region: region,
          CidrBlock: "10.0.0.0/16",
        },
        AccepterVpcInfo: {
          VpcId: "vpc-0peer",
          OwnerId: "999999999999",
          Region: "us-east-1",
          CidrBlockSet: [
            { CidrBlock: "10.1.0.0/16" },
            { CidrBlock: "10.2.0.0/16" },
          ],
          PeeringOptions: { AllowDnsResolutionFromRemoteVpc: true },
        },
      },
    ],
  });
  mocked.on(DescribeTransitGatewaysCommand).resolves({
    TransitGateways: [
      {
        TransitGatewayId: "tgw-0core",
        OwnerId: "999999999999",
        State: "available",
        Description: "core network",
        Options: {
          AmazonSideAsn: 64512,
          AssociationDefaultRouteTableId: "tgw-rtb-0default",
          TransitGatewayCidrBlocks: ["10.255.0.0/24"],
        },
      },
    ],
  });
  mocked.on(DescribeTransitGatewayAttachmentsCommand).resolves({
    TransitGatewayAttachments: [
      {
        TransitGatewayAttachmentId: "tgw-attach-0main",
        TransitGatewayId: "tgw-0core",
        TransitGatewayOwnerId: "999999999999",
        ResourceType: "vpc",
        ResourceId: vpcId,
        ResourceOwnerId: account,
        State: "available",
        Association: {
          TransitGatewayRouteTableId: "tgw-rtb-0default",
          State: "associated",
        },
      },
    ],
  });
  mocked.on(DescribeVpnGatewaysCommand).resolves({
    VpnGateways: [
      {
        VpnGatewayId: "vgw-0onprem",
        State: "available",
        Type: "ipsec.1",
        AmazonSideAsn: 64513,
        VpcAttachments: [
          { VpcId: "vpc-0old", State: "detached" },
          { VpcId: vpcId, State: "attached" },
        ],
      },
    ],
  });
  mocked
    .on(DescribeManagedPrefixListsCommand, { NextToken: undefined })
    .resolves({
      PrefixLists: [
        {
          PrefixListId: "pl-s3",
          PrefixListName: `com.amazonaws.${region}.s3`,
          OwnerId: "AWS",
          AddressFamily: "IPv4",
        },
      ],
      NextToken: "pl-page-2",
    })
    .on(DescribeManagedPrefixListsCommand, { NextToken: "pl-page-2" })
    .resolves({
      PrefixLists: [
        {
          PrefixListId: "pl-corp",
          PrefixListName: "corp",
          OwnerId: account,
          AddressFamily: "IPv4",
          MaxEntries: 5,
          State: "create-complete",
          Version: 3,
        },
      ],
    });
  mocked
    .on(GetManagedPrefixListEntriesCommand, {
      PrefixListId: "pl-corp",
      NextToken: undefined,
    })
    .resolves({
      Entries: [{ Cidr: "203.0.113.0/24", Description: "office" }],
      NextToken: "entries-2",
    })
    .on(GetManagedPrefixListEntriesCommand, {
      PrefixListId: "pl-corp",
      NextToken: "entries-2",
    })
    .resolves({ Entries: [{ Cidr: "198.51.100.0/24", Description: "dc" }] });
  mocked.on(DescribeDhcpOptionsCommand).resolves({
    DhcpOptions: [
      {
        DhcpOptionsId: "dopt-0main",
        OwnerId: account,
        DhcpConfigurations: [
          {
            Key: "domain-name",
            Values: [{ Value: `${region}.compute.internal` }],
          },
          {
            Key: "domain-name-servers",
            Values: [{ Value: "AmazonProvidedDNS" }],
          },
        ],
      },
    ],
  });
  mocked.on(DescribeFlowLogsCommand).resolves({
    FlowLogs: [
      {
        FlowLogId: "fl-0vpc",
        ResourceId: vpcId,
        TrafficType: "ALL",
        FlowLogStatus: "ACTIVE",
        DeliverLogsStatus: "SUCCESS",
        LogDestinationType: "cloud-watch-logs",
        LogGroupName: "/vpc/main",
        CreationTime: new Date("2026-01-01T00:00:00Z"),
      },
    ],
  });
  mocked.on(DescribeAddressesCommand).resolves({
    Addresses: [
      {
        AllocationId: "eipalloc-0nat",
        AssociationId: "eipassoc-0nat",
        PublicIp: "54.0.0.1",
        PrivateIpAddress: "10.0.0.10",
        NetworkInterfaceId: "eni-0nat",
        Domain: "vpc",
      },
      { AllocationId: "eipalloc-0unused", PublicIp: "54.0.0.2", Domain: "vpc" },
    ],
  });
  return { client, mocked };
}

async function scan() {
  const connector = buildFsConnector(
    mkdtempSync(join(tmpdir(), "infrascan-ec2-network-")),
  );
  const { client, mocked } = mockScan();
  for (const getter of EC2Scanner.getters) {
    await getter(client, connector, context);
  }
  return { connector, mocked };
}

async function buildNodes(connector: Connector) {
  const nodes: Record<string, BaseState[]> = {};
  for (const entity of EC2Scanner.entities ?? []) {
    nodes[entity.nodeType] = [];
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes[entity.nodeType].push(node);
    }
  }
  return nodes;
}

type Nodes = Record<string, BaseState[]>;

function node<T = Record<string, any>>(
  nodes: Nodes,
  nodeType: string,
  id: string,
): BaseState & T {
  return nodes[nodeType].find(
    (candidate) => candidate.$graph.id === id,
  ) as BaseState & T;
}

t.test("Network getters paginate and fan out", async ({ equal, same }) => {
  const { mocked } = await scan();

  equal(mocked.commandCalls(DescribeRouteTablesCommand).length, 2);
  equal(mocked.commandCalls(DescribeManagedPrefixListsCommand).length, 2);
  // Entries are only fetched for customer managed lists
  same(
    mocked
      .commandCalls(GetManagedPrefixListEntriesCommand)
      .map((call) => call.args[0].input.PrefixListId),
    ["pl-corp", "pl-corp"],
  );
  // One call per (VPC, attribute) pair
  same(
    mocked
      .commandCalls(DescribeVpcAttributeCommand)
      .map((call) => call.args[0].input),
    [
      { VpcId: vpcId, Attribute: "enableDnsSupport" },
      { VpcId: vpcId, Attribute: "enableDnsHostnames" },
    ],
  );
  for (const command of [
    DescribeInternetGatewaysCommand,
    DescribeEgressOnlyInternetGatewaysCommand,
    DescribeVpcEndpointsCommand,
    DescribeNetworkAclsCommand,
    DescribeVpcPeeringConnectionsCommand,
    DescribeTransitGatewaysCommand,
    DescribeTransitGatewayAttachmentsCommand,
    DescribeVpnGatewaysCommand,
    DescribeDhcpOptionsCommand,
    DescribeFlowLogsCommand,
    DescribeAddressesCommand,
  ]) {
    equal(mocked.commandCalls(command).length, 1, command.name);
  }
});

t.test("Every network node is added to the graph", async ({ equal, ok }) => {
  const { connector } = await scan();
  const nodes = await buildNodes(connector);

  const graph = Graph();
  graph.addNode({ $graph: { id: account } } as unknown as BaseState);
  graph.addNode({
    $graph: { id: regionNodeId, parent: account },
  } as unknown as BaseState);
  // Nodes are added in entity order, as the SDK does, so VPC parents must already exist
  for (const entity of EC2Scanner.entities ?? []) {
    for (const entityNode of nodes[entity.nodeType]) {
      graph.addNode(entityNode);
    }
  }

  const expectedParents: [string, string][] = [
    ["rtb-main", vpcId],
    ["rtb-private", vpcId],
    ["acl-0default", vpcId],
    ["vpce-0s3", vpcId],
    ["vpce-0sqs", vpcId],
    ["igw-0main", regionNodeId],
    ["igw-0detached", regionNodeId],
    ["eigw-0main", regionNodeId],
    ["vgw-0onprem", regionNodeId],
    ["pcx-0peer", regionNodeId],
    ["tgw-0core", regionNodeId],
    ["tgw-attach-0main", regionNodeId],
    ["pl-s3", regionNodeId],
    ["pl-corp", regionNodeId],
    ["dopt-0main", regionNodeId],
    ["fl-0vpc", regionNodeId],
    ["eipalloc-0nat", regionNodeId],
    ["eipalloc-0unused", regionNodeId],
  ];
  for (const [id, parent] of expectedParents) {
    ok(graph.getNode(id), id);
    equal(graph.getNode(id)?.parent?.$graph.id, parent, `${id} parent`);
  }

  for (const entity of [
    RouteTableEntity,
    NetworkAclEntity,
    VpcEndpointEntity,
    InternetGatewayEntity,
    EgressOnlyInternetGatewayEntity,
    VpnGatewayEntity,
    VpcPeeringConnectionEntity,
    TransitGatewayEntity,
    TransitGatewayAttachmentEntity,
    ManagedPrefixListEntity,
    DhcpOptionsEntity,
    FlowLogEntity,
    ElasticIpEntity,
  ]) {
    for (const entityNode of nodes[entity.nodeType]) {
      equal(entityNode.$graph.nodeType, entity.nodeType);
      equal(entityNode.$graph.nodeClass, "informational");
      equal(entityNode.resource.id, entityNode.$graph.id);
      equal(entityNode.resource.subcategory, entity.subcategory);
      equal(entityNode.tenant.tenantId, account);
      equal(entityNode.location?.code, region);
      equal(entityNode.$source?.command, entity.command);
    }
  }
});

t.test("Route tables, NACLs and endpoints", async ({ equal, same }) => {
  const { connector } = await scan();
  const nodes = await buildNodes(connector);

  const main = node(nodes, RouteTableEntity.nodeType, "rtb-main");
  same(main.network?.vpc, { id: vpcId });
  equal(main.routeTable.main, true);
  same(main.routeTable.propagatingVgwIds, ["vgw-0onprem"]);
  same(main.routeTable.associations, [
    {
      associationId: "rtbassoc-main",
      main: true,
      subnetId: undefined,
      gatewayId: undefined,
      state: "associated",
    },
  ]);
  equal(main.routeTable.routes[1].transitGatewayId, "tgw-0core");

  const priv = node(nodes, RouteTableEntity.nodeType, "rtb-private");
  equal(priv.routeTable.main, false);
  equal(priv.routeTable.associations[0].subnetId, privateSubnet);
  same(
    priv.routeTable.routes.map((route: Record<string, unknown>) => [
      route.destinationCidrBlock ?? route.destinationPrefixListId,
      route.natGatewayId ?? route.gatewayId,
      route.state,
    ]),
    [
      ["0.0.0.0/0", "nat-0main", "active"],
      ["pl-s3", "vpce-0s3", "active"],
      ["192.168.0.0/16", undefined, "blackhole"],
    ],
  );

  const acl = node(nodes, NetworkAclEntity.nodeType, "acl-0default");
  equal(acl.networkAcl.isDefault, true);
  same(acl.networkAcl.associations, [
    { associationId: "aclassoc-public", subnetId: publicSubnet },
  ]);
  same(acl.networkAcl.entries[0], {
    ruleNumber: 100,
    egress: false,
    ruleAction: "allow",
    protocol: "6",
    cidrBlock: "0.0.0.0/0",
    ipv6CidrBlock: undefined,
    portRange: { from: 443, to: 443 },
    icmpTypeCode: undefined,
  });

  const s3 = node(nodes, VpcEndpointEntity.nodeType, "vpce-0s3");
  equal(s3.vpcEndpoint.endpointType, "Gateway");
  same(s3.vpcEndpoint.routeTableIds, ["rtb-private"]);
  equal(s3.resource.policy, '{"Statement":[]}');
  const sqs = node(nodes, VpcEndpointEntity.nodeType, "vpce-0sqs");
  same(sqs.network?.targetSubnets, [privateSubnet]);
  same(sqs.network?.securityGroups, ["sg-0app"]);
  same(sqs.vpcEndpoint.networkInterfaceIds, ["eni-0vpce"]);
  equal(sqs.vpcEndpoint.privateDnsEnabled, true);
  equal(sqs.vpcEndpoint.dnsEntries[0].hostedZoneId, "Z1");
});

t.test("Gateways, peering and transit", async ({ equal, same }) => {
  const { connector } = await scan();
  const nodes = await buildNodes(connector);

  const igw = node(nodes, InternetGatewayEntity.nodeType, "igw-0main");
  same(igw.network?.vpc, { id: vpcId });
  same(igw.internetGateway, {
    ownerId: account,
    attachments: [{ vpcId, state: "available" }],
  });
  const detached = node(nodes, InternetGatewayEntity.nodeType, "igw-0detached");
  equal(detached.network?.vpc, undefined);
  same(detached.internetGateway.attachments, []);

  const eigw = node(
    nodes,
    EgressOnlyInternetGatewayEntity.nodeType,
    "eigw-0main",
  );
  same(eigw.egressOnlyInternetGateway.attachments, [
    { vpcId, state: "attached" },
  ]);

  // The VPC reference is the attached VPC, not the first (detached) attachment
  const vgw = node(nodes, VpnGatewayEntity.nodeType, "vgw-0onprem");
  same(vgw.network?.vpc, { id: vpcId });
  equal(vgw.vpnGateway.attachments.length, 2);
  equal(vgw.vpnGateway.amazonSideAsn, 64513);

  const pcx = node(nodes, VpcPeeringConnectionEntity.nodeType, "pcx-0peer");
  equal(pcx.vpcPeeringConnection.status, "active");
  same(pcx.vpcPeeringConnection.requester.cidrBlocks, ["10.0.0.0/16"]);
  same(pcx.vpcPeeringConnection.accepter, {
    vpcId: "vpc-0peer",
    ownerId: "999999999999",
    region: "us-east-1",
    cidrBlocks: ["10.1.0.0/16", "10.2.0.0/16"],
    ipv6CidrBlocks: [],
    allowDnsResolutionFromRemoteVpc: true,
  });

  const tgw = node(nodes, TransitGatewayEntity.nodeType, "tgw-0core");
  equal(tgw.transitGateway.amazonSideAsn, 64512);
  equal(tgw.transitGateway.associationDefaultRouteTableId, "tgw-rtb-0default");
  same(tgw.transitGateway.cidrBlocks, ["10.255.0.0/24"]);
  equal(tgw.resource.description, "core network");

  const attachment = node(
    nodes,
    TransitGatewayAttachmentEntity.nodeType,
    "tgw-attach-0main",
  );
  same(attachment.network?.vpc, { id: vpcId });
  equal(attachment.transitGatewayAttachment.transitGatewayId, "tgw-0core");
  same(attachment.transitGatewayAttachment.association, {
    transitGatewayRouteTableId: "tgw-rtb-0default",
    state: "associated",
  });
});

t.test(
  "Prefix lists, DHCP options, flow logs and Elastic IPs",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const corp = node(nodes, ManagedPrefixListEntity.nodeType, "pl-corp");
    equal(corp.$graph.label, "corp");
    // Entry pages are merged onto the list they were fetched for
    same(corp.prefixList.entries, [
      { cidr: "203.0.113.0/24", description: "office" },
      { cidr: "198.51.100.0/24", description: "dc" },
    ]);
    equal(corp.prefixList.maxEntries, 5);
    const s3 = node(nodes, ManagedPrefixListEntity.nodeType, "pl-s3");
    equal(s3.prefixList.ownerId, "AWS");
    equal(s3.prefixList.entries, undefined);

    const dhcp = node(nodes, DhcpOptionsEntity.nodeType, "dopt-0main");
    same(dhcp.dhcpOptions.configurations, [
      { key: "domain-name", values: [`${region}.compute.internal`] },
      { key: "domain-name-servers", values: ["AmazonProvidedDNS"] },
    ]);

    const flowLog = node(nodes, FlowLogEntity.nodeType, "fl-0vpc");
    equal(flowLog.flowLog.resourceId, vpcId);
    equal(flowLog.flowLog.trafficType, "ALL");
    equal(flowLog.flowLog.destinationType, "cloud-watch-logs");
    equal(flowLog.audit?.createdAt, Date.parse("2026-01-01T00:00:00Z"));

    const eip = node(nodes, ElasticIpEntity.nodeType, "eipalloc-0nat");
    equal(eip.$graph.label, "54.0.0.1");
    same(eip.network?.publicIp, { status: "enabled", address: "54.0.0.1" });
    equal(eip.elasticIp.networkInterfaceId, "eni-0nat");
    const unused = node(nodes, ElasticIpEntity.nodeType, "eipalloc-0unused");
    equal(unused.elasticIp.associationId, undefined);
  },
);

t.test(
  "Existing nodes gain VPC DNS attributes, egress rules and interface details",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const vpc = node(nodes, VpcEntity.nodeType, vpcId);
    equal(vpc.vpc.enableDnsSupport, true);
    equal(vpc.vpc.enableDnsHostnames, false);

    const sg = node(nodes, SecurityGroupEntity.nodeType, "sg-0app");
    equal(sg.network?.rules?.length, 1);
    const egressRules = (sg.network as Record<string, any>).egressRules;
    equal(egressRules.length, 2);
    equal(egressRules[0].protocol, "ALL");
    same(egressRules[1].awsConfig.prefixLists, [
      { prefixListId: "pl-corp", description: undefined },
    ]);

    const nat = node(nodes, NatGatewayEntity.nodeType, "nat-0main");
    equal(nat.natGateway.connectivityType, "public");
    equal(nat.natGateway.addresses[0].networkInterfaceId, "eni-0nat");

    const eni = node(nodes, NetworkInterfaceEntity.nodeType, "eni-0nat");
    equal(eni.networkInterface.interfaceType, "nat_gateway");
    equal(eni.networkInterface.requesterManaged, true);
    equal(eni.networkInterface.sourceDestCheck, false);
    equal(eni.networkInterface.elasticIp.allocationId, "eipalloc-0nat");
  },
);

t.test(
  "Missing network state produces no nodes rather than failing",
  async ({ equal }) => {
    const connector = buildFsConnector(
      mkdtempSync(join(tmpdir(), "infrascan-ec2-network-empty-")),
    );
    const client = EC2Scanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().resolves({});
    mocked.on(DescribeVpcsCommand).resolves({ Vpcs: [{ VpcId: vpcId }] });
    for (const getter of EC2Scanner.getters) {
      await getter(client, connector, context);
    }
    const nodes = await buildNodes(connector);
    equal(nodes[VpcEntity.nodeType].length, 1);
    equal(
      node(nodes, VpcEntity.nodeType, vpcId).vpc.enableDnsSupport,
      undefined,
    );
    equal(nodes[RouteTableEntity.nodeType].length, 0);
    equal(nodes[ManagedPrefixListEntity.nodeType].length, 0);
  },
);
