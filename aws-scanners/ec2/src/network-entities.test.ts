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
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplateVersionsCommand,
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
  LaunchTemplateEntity,
  ManagedPrefixListEntity,
  NatGatewayEntity,
  NetworkAclEntity,
  NetworkInterfaceEntity,
  RouteTableEntity,
  SecurityGroupEntity,
  SubnetEntity,
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
const secondVpcId = "vpc-0second";
const secondSubnet = "subnet-0second";
const subnetArn = (subnetId: string) =>
  `arn:aws:ec2:${region}:${account}:subnet/${subnetId}`;

function mockScan() {
  const client = EC2Scanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().resolves({});

  // Two VPCs over two pages; the second VPC's attribute calls are refused
  mocked
    .on(DescribeVpcsCommand, { NextToken: undefined })
    .resolves({
      Vpcs: [{ VpcId: vpcId, CidrBlock: "10.0.0.0/16" }],
      NextToken: "vpc-page-2",
    })
    .on(DescribeVpcsCommand, { NextToken: "vpc-page-2" })
    .resolves({
      Vpcs: [
        {
          VpcId: secondVpcId,
          CidrBlock: "10.9.0.0/16",
          // AWS repeats the primary CIDR block in the association set
          CidrBlockAssociationSet: [
            { CidrBlock: "10.9.0.0/16", AssociationId: "vpc-cidr-assoc-1" },
            { CidrBlock: "10.10.0.0/16", AssociationId: "vpc-cidr-assoc-2" },
          ],
        },
      ],
    });
  mocked
    .on(DescribeVpcAttributeCommand, { VpcId: secondVpcId })
    .rejects(new Error("UnauthorizedOperation"));
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
  // Subnets are only returned for the VPC named in the filter
  mocked
    .on(DescribeSubnetsCommand, {
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    })
    .resolves({
      Subnets: [publicSubnet, privateSubnet].map((subnetId) => ({
        SubnetId: subnetId,
        SubnetArn: subnetArn(subnetId),
        VpcId: vpcId,
        AvailabilityZone: `${region}a`,
        AvailabilityZoneId: "euw1-az1",
        OwnerId: account,
        CidrBlock: subnetId === publicSubnet ? "10.0.0.0/24" : "10.0.1.0/24",
      })),
    })
    .on(DescribeSubnetsCommand, {
      Filters: [{ Name: "vpc-id", Values: [secondVpcId] }],
    })
    .resolves({
      Subnets: [
        {
          SubnetId: secondSubnet,
          SubnetArn: subnetArn(secondSubnet),
          VpcId: secondVpcId,
          AvailabilityZoneId: "euw1-az2",
          OwnerId: "444444444444",
          CidrBlock: "10.9.0.0/24",
          CustomerOwnedIpv4Pool: "ipv4pool-coip-0123",
        },
      ],
    });
  mocked.on(DescribeLaunchTemplatesCommand).resolves({
    LaunchTemplates: [
      {
        LaunchTemplateId: "lt-0web",
        LaunchTemplateName: "web",
        Tags: [{ Key: "team", Value: "web" }],
      },
    ],
  });
  mocked.on(DescribeLaunchTemplateVersionsCommand).resolves({
    LaunchTemplateVersions: [
      {
        LaunchTemplateId: "lt-0web",
        LaunchTemplateName: "web",
        VersionNumber: 3,
        DefaultVersion: true,
        LaunchTemplateData: {
          InstanceType: "t3.micro",
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [{ Key: "Name", Value: "web-instance" }],
            },
          ],
        },
      },
    ],
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
        TagSet: [{ Key: "Name", Value: "nat-eni" }],
      },
      {
        NetworkInterfaceId: "eni-0vpce",
        VpcId: vpcId,
        SubnetId: privateSubnet,
        InterfaceType: "vpc_endpoint",
        Description: "VPC Endpoint Interface vpce-0sqs",
        RequesterManaged: true,
        PrivateIpAddress: "10.0.1.20",
      },
      {
        NetworkInterfaceId: "eni-0instance",
        VpcId: vpcId,
        SubnetId: publicSubnet,
        InterfaceType: "interface",
        OwnerId: account,
        RequesterManaged: false,
        PrivateIpAddress: "10.0.0.30",
        Attachment: {
          AttachmentId: "eni-attach-0instance",
          InstanceId: "i-0bastion",
          InstanceOwnerId: account,
          DeviceIndex: 0,
          Status: "attached",
        },
        Association: {
          PublicIp: "34.0.0.1",
          IpOwnerId: "amazon",
        },
        PrivateIpAddresses: [
          {
            PrivateIpAddress: "10.0.0.30",
            Primary: true,
            PrivateDnsName: "ip-10-0-0-30.eu-west-1.compute.internal",
            Association: { PublicIp: "34.0.0.1", IpOwnerId: "amazon" },
          },
          { PrivateIpAddress: "10.0.0.31", Primary: false },
        ],
        Ipv6Addresses: [
          { Ipv6Address: "2001:db8::30", IsPrimaryIpv6: true },
          { Ipv6Address: "2001:db8::31" },
        ],
        Operator: { Managed: false },
      },
      {
        NetworkInterfaceId: "eni-0lambda",
        VpcId: vpcId,
        SubnetId: privateSubnet,
        InterfaceType: "lambda",
        Description: "AWS Lambda VPC ENI-worker-0123",
        RequesterManaged: true,
        RequesterId: "AROAEXAMPLE:worker",
        Operator: { Managed: true, Principal: "lambda.amazonaws.com" },
        Attachment: { InstanceOwnerId: "amazon-aws", Status: "attached" },
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
        Tags: [{ Key: "Name", Value: "nat" }],
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
      {
        VpcEndpointId: "vpce-0lattice",
        VpcEndpointType: "ServiceNetwork",
        VpcId: vpcId,
        State: "available",
        ServiceNetworkArn: `arn:aws:vpc-lattice:${region}:${account}:servicenetwork/sn-0123`,
        SubnetIds: [privateSubnet],
      },
      {
        VpcEndpointId: "vpce-0resource",
        VpcEndpointType: "Resource",
        VpcId: vpcId,
        State: "failed",
        ResourceConfigurationArn: `arn:aws:vpc-lattice:${region}:${account}:resourceconfiguration/rcfg-0123`,
        LastError: { Code: "InsufficientCapacity", Message: "no capacity" },
        FailureReason: "Insufficient capacity in subnet",
        Ipv4Prefixes: [
          { SubnetId: privateSubnet, IpPrefixes: ["10.0.1.64/28"] },
        ],
      },
      {
        VpcEndpointId: "vpce-0crossregion",
        VpcEndpointType: "Interface",
        VpcId: vpcId,
        ServiceName: "com.amazonaws.vpce.us-east-1.vpce-svc-0123",
        ServiceRegion: "us-east-1",
        State: "available",
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
      {
        NetworkAclId: "acl-0private",
        VpcId: vpcId,
        IsDefault: false,
        Associations: [
          {
            NetworkAclAssociationId: "aclassoc-private",
            NetworkAclId: "acl-0private",
            SubnetId: privateSubnet,
          },
        ],
        Entries: [],
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
        {
          PrefixListId: "pl-cloudfront",
          PrefixListName: "com.amazonaws.global.cloudfront.origin-facing",
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
        {
          PrefixListId: "pl-partner",
          PrefixListName: "partner",
          OwnerId: account,
          AddressFamily: "IPv4",
          MaxEntries: 2,
        },
      ],
    });
  mocked
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-s3" })
    .resolves({ Entries: [{ Cidr: "52.218.0.0/17" }] })
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-partner" })
    .resolves({ Entries: [{ Cidr: "192.0.2.0/24", Description: "partner" }] });
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

  equal(mocked.commandCalls(DescribeVpcsCommand).length, 2);
  equal(mocked.commandCalls(DescribeRouteTablesCommand).length, 2);
  equal(mocked.commandCalls(DescribeManagedPrefixListsCommand).length, 2);
  // Entries are fetched for customer managed lists and the AWS managed gateway endpoint lists (s3), not for other AWS
  // managed lists (cloudfront)
  same(
    mocked
      .commandCalls(GetManagedPrefixListEntriesCommand)
      .map((call) => call.args[0].input.PrefixListId),
    ["pl-s3", "pl-corp", "pl-corp", "pl-partner"],
  );
  // One call per (VPC, attribute) pair, across both DescribeVpcs pages
  same(
    mocked
      .commandCalls(DescribeVpcAttributeCommand)
      .map((call) => call.args[0].input),
    [
      { VpcId: vpcId, Attribute: "enableDnsSupport" },
      { VpcId: vpcId, Attribute: "enableDnsHostnames" },
      { VpcId: secondVpcId, Attribute: "enableDnsSupport" },
      { VpcId: secondVpcId, Attribute: "enableDnsHostnames" },
    ],
  );
  // One filtered DescribeSubnets call per VPC
  same(
    mocked
      .commandCalls(DescribeSubnetsCommand)
      .map((call) => call.args[0].input.Filters),
    [
      [{ Name: "vpc-id", Values: [vpcId] }],
      [{ Name: "vpc-id", Values: [secondVpcId] }],
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

  const expectedParents: [string, string | undefined][] = [
    ["rtb-main", vpcId],
    ["rtb-private", vpcId],
    ["acl-0default", vpcId],
    ["vpce-0s3", vpcId],
    ["vpce-0sqs", vpcId],
    ["igw-0main", regionNodeId],
    ["igw-0detached", regionNodeId],
    ["eigw-0main", regionNodeId],
    ["vgw-0onprem", regionNodeId],
    // Requested by this account and region
    ["pcx-0peer", regionNodeId],
    // Owned by an account that was not scanned: a root node, owned by 999999999999
    ["tgw-0core", undefined],
    // The attached VPC belongs to this account
    ["tgw-attach-0main", regionNodeId],
    // Prefix lists, AWS managed ones included, are scoped to the scanned account
    [`${account}:pl-s3`, regionNodeId],
    [`${account}:pl-cloudfront`, regionNodeId],
    [`${account}:pl-corp`, regionNodeId],
    [`${account}:pl-partner`, regionNodeId],
    ["dopt-0main", regionNodeId],
    ["fl-0vpc", regionNodeId],
    ["eipalloc-0nat", regionNodeId],
    ["eipalloc-0unused", regionNodeId],
  ];
  for (const [id, parent] of expectedParents) {
    ok(graph.getNode(id), id);
    equal(graph.getNode(id)?.parent?.$graph.id, parent, `${id} parent`);
  }

  // Tenants come from the AWS owner field, not the scanned account
  const expectedTenants: Record<string, string> = {
    "tgw-0core": "999999999999",
  };
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
      equal(
        entityNode.tenant.tenantId,
        expectedTenants[entityNode.$graph.id] ?? account,
        `${entityNode.$graph.id} tenant`,
      );
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

    const corp = node(
      nodes,
      ManagedPrefixListEntity.nodeType,
      `${account}:pl-corp`,
    );
    equal(corp.$graph.label, "corp");
    // The raw id joins with route table, security group and endpoint references
    equal(corp.prefixList.prefixListId, "pl-corp");
    // Entry pages are merged onto the list they were fetched for
    same(corp.prefixList.entries, [
      { cidr: "203.0.113.0/24", description: "office" },
      { cidr: "198.51.100.0/24", description: "dc" },
    ]);
    equal(corp.prefixList.maxEntries, 5);
    const s3 = node(
      nodes,
      ManagedPrefixListEntity.nodeType,
      `${account}:pl-s3`,
    );
    equal(s3.prefixList.prefixListId, "pl-s3");
    equal(s3.prefixList.ownerId, "AWS");
    equal(s3.tenant.tenantId, account);
    same(s3.prefixList.entries, [
      { cidr: "52.218.0.0/17", description: undefined },
    ]);
    const cloudfront = node(
      nodes,
      ManagedPrefixListEntity.nodeType,
      `${account}:pl-cloudfront`,
    );
    equal(cloudfront.prefixList.entries, undefined);
    // Each list only receives its own entries
    const partner = node(
      nodes,
      ManagedPrefixListEntity.nodeType,
      `${account}:pl-partner`,
    );
    same(partner.prefixList.entries, [
      { cidr: "192.0.2.0/24", description: "partner" },
    ]);

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

t.test(
  "Subnets record their ids, route table and network ACL",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    // Filtered calls return each subnet once
    same(
      nodes[SubnetEntity.nodeType].map((subnet) => subnet.$graph.id).sort(),
      [publicSubnet, privateSubnet, secondSubnet].map(subnetArn).sort(),
    );

    const pub = node(nodes, SubnetEntity.nodeType, subnetArn(publicSubnet));
    equal(pub.subnet.subnetId, publicSubnet);
    equal(pub.subnet.vpcId, vpcId);
    equal(pub.subnet.availabilityZoneId, "euw1-az1");
    equal(pub.subnet.ownerId, account);
    // No explicit association: the VPC's main route table applies
    same(pub.subnet.routeTable, { id: "rtb-main", main: true, implicit: true });
    same(pub.subnet.networkAcl, {
      id: "acl-0default",
      associationId: "aclassoc-public",
      isDefault: true,
    });

    const priv = node(nodes, SubnetEntity.nodeType, subnetArn(privateSubnet));
    same(priv.subnet.routeTable, {
      id: "rtb-private",
      associationId: "rtbassoc-private",
      main: false,
      implicit: false,
    });
    same(priv.subnet.networkAcl, {
      id: "acl-0private",
      associationId: "aclassoc-private",
      isDefault: false,
    });

    // No route tables or network ACLs were reported for the second VPC, so neither is guessed
    const second = node(nodes, SubnetEntity.nodeType, subnetArn(secondSubnet));
    equal(second.subnet.routeTable, undefined);
    equal(second.subnet.networkAcl, undefined);
    equal(second.subnet.ownerId, "444444444444");
    // A customer-owned pool id is not a CIDR block
    equal(second.subnet.customerOwnedIpv4Pool, "ipv4pool-coip-0123");
    same(second.network?.reservedAddresses, [
      { family: "ipv4", cidrBlock: "10.9.0.0/24" },
    ]);
  },
);

t.test(
  "Subnet membership is omitted when route tables and ACLs could not be read",
  async ({ equal }) => {
    const connector = buildFsConnector(
      mkdtempSync(join(tmpdir(), "infrascan-ec2-network-denied-")),
    );
    const client = EC2Scanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().resolves({});
    mocked.on(DescribeVpcsCommand).resolves({ Vpcs: [{ VpcId: vpcId }] });
    mocked.on(DescribeSubnetsCommand).resolves({
      Subnets: [
        {
          SubnetId: publicSubnet,
          SubnetArn: subnetArn(publicSubnet),
          VpcId: vpcId,
        },
      ],
    });
    mocked
      .on(DescribeRouteTablesCommand)
      .rejects(new Error("UnauthorizedOperation"));
    mocked
      .on(DescribeNetworkAclsCommand)
      .rejects(new Error("UnauthorizedOperation"));
    for (const getter of EC2Scanner.getters) {
      await getter(client, connector, context);
    }
    const nodes = await buildNodes(connector);
    const pub = node(nodes, SubnetEntity.nodeType, subnetArn(publicSubnet));
    equal(pub.subnet.subnetId, publicSubnet);
    equal(pub.subnet.routeTable, undefined);
    equal(pub.subnet.networkAcl, undefined);
  },
);

t.test(
  "VPC reserved addresses list each CIDR block once",
  async ({ same, equal }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);
    const second = node(nodes, VpcEntity.nodeType, secondVpcId);
    same(second.network?.reservedAddresses, [
      { family: "ipv4", cidrBlock: "10.9.0.0/16" },
      { family: "ipv4", cidrBlock: "10.10.0.0/16" },
    ]);
    // The refused DescribeVpcAttribute calls only blank this VPC's DNS attributes
    equal(second.vpc.enableDnsSupport, undefined);
    equal(second.vpc.enableDnsHostnames, undefined);
    const main = node(nodes, VpcEntity.nodeType, vpcId);
    equal(main.vpc.enableDnsSupport, true);
    equal(main.vpc.enableDnsHostnames, false);
  },
);

t.test(
  "Network interfaces carry addresses, operator and exact owners",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const nat = node(nodes, NetworkInterfaceEntity.nodeType, "eni-0nat");
    // Listed by the NAT gateway's own addresses
    same(nat.networkInterface.owner, { type: "nat-gateway", id: "nat-0main" });
    same(nat.tags, [{ key: "Name", value: "nat-eni" }]);

    const vpce = node(nodes, NetworkInterfaceEntity.nodeType, "eni-0vpce");
    same(vpce.networkInterface.owner, {
      type: "vpc-endpoint",
      id: "vpce-0sqs",
    });

    const instance = node(
      nodes,
      NetworkInterfaceEntity.nodeType,
      "eni-0instance",
    );
    same(instance.networkInterface.owner, {
      type: "instance",
      id: "i-0bastion",
    });
    equal(instance.networkInterface.attachment.instanceOwnerId, account);
    equal(instance.networkInterface.interfaceType, "interface");
    equal(instance.networkInterface.ipOwnerId, "amazon");
    same(instance.networkInterface.operator, {
      managed: false,
      principal: undefined,
    });
    same(instance.networkInterface.privateIpAddresses, [
      {
        address: "10.0.0.30",
        primary: true,
        privateDnsName: "ip-10-0-0-30.eu-west-1.compute.internal",
        publicIp: "34.0.0.1",
        ipOwnerId: "amazon",
        allocationId: undefined,
      },
      {
        address: "10.0.0.31",
        primary: false,
        privateDnsName: undefined,
        publicIp: undefined,
        ipOwnerId: undefined,
        allocationId: undefined,
      },
    ]);
    same(instance.networkInterface.ipv6Addresses, [
      { address: "2001:db8::30", isPrimary: true },
      { address: "2001:db8::31", isPrimary: undefined },
    ]);
    equal(
      instance.network?.assignedAddresses?.ipv6,
      "2001:db8::30, 2001:db8::31",
    );
    equal(instance.tags, undefined);

    // No AWS field names the owning function, so no owner is set; the facts are kept as reported
    const lambda = node(nodes, NetworkInterfaceEntity.nodeType, "eni-0lambda");
    equal(lambda.networkInterface.owner, undefined);
    same(lambda.networkInterface.operator, {
      managed: true,
      principal: "lambda.amazonaws.com",
    });
    equal(lambda.networkInterface.requesterId, "AROAEXAMPLE:worker");
    equal(lambda.networkInterface.requesterManaged, true);
    equal(lambda.networkInterface.interfaceType, "lambda");
    same(lambda.networkInterface.ipv6Addresses, []);
  },
);

t.test(
  "Resource, service network and cross-region endpoints keep their target",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const lattice = node(nodes, VpcEndpointEntity.nodeType, "vpce-0lattice");
    equal(lattice.vpcEndpoint.endpointType, "ServiceNetwork");
    equal(
      lattice.vpcEndpoint.serviceNetworkArn,
      `arn:aws:vpc-lattice:${region}:${account}:servicenetwork/sn-0123`,
    );

    const resource = node(nodes, VpcEndpointEntity.nodeType, "vpce-0resource");
    equal(resource.vpcEndpoint.endpointType, "Resource");
    equal(
      resource.vpcEndpoint.resourceConfigurationArn,
      `arn:aws:vpc-lattice:${region}:${account}:resourceconfiguration/rcfg-0123`,
    );
    same(resource.vpcEndpoint.lastError, {
      code: "InsufficientCapacity",
      message: "no capacity",
    });
    equal(
      resource.vpcEndpoint.failureReason,
      "Insufficient capacity in subnet",
    );
    same(resource.vpcEndpoint.ipv4Prefixes, [
      { subnetId: privateSubnet, prefixes: ["10.0.1.64/28"] },
    ]);

    const crossRegion = node(
      nodes,
      VpcEndpointEntity.nodeType,
      "vpce-0crossregion",
    );
    equal(crossRegion.vpcEndpoint.serviceRegion, "us-east-1");
    equal(crossRegion.vpcEndpoint.lastError, undefined);
  },
);

t.test(
  "Tags use the top-level { key, value } shape",
  async ({ same, equal }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const nat = node(nodes, NatGatewayEntity.nodeType, "nat-0main");
    same(nat.tags, [{ key: "Name", value: "nat" }]);

    // The launch template's own tags; TagSpecifications (tags for launched resources) are not the template's tags
    const template = node(nodes, LaunchTemplateEntity.nodeType, "lt-0web");
    same(template.tags, [{ key: "team", value: "web" }]);
    equal(JSON.stringify(template).includes("web-instance"), false);

    // No node carries a tag array outside its top-level tags component
    for (const nodesOfType of Object.values(nodes)) {
      for (const entityNode of nodesOfType) {
        for (const tag of entityNode.tags ?? []) {
          same(Object.keys(tag).sort(), ["key", "value"]);
        }
        const { tags, ...components } = entityNode;
        equal(
          JSON.stringify(components).includes('"tags"'),
          false,
          `${entityNode.$graph.id} has no nested tags`,
        );
      }
    }
  },
);
