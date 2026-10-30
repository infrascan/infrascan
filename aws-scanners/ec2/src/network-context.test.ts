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
  type NetworkInterface,
  type RouteTable,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import { Graph, generateNodesFromEntity } from "@infrascan/core";
import type { BaseState, Connector } from "@infrascan/shared-types";
import EC2Scanner from ".";
import { DescribeSubnets, DescribeVpcs } from "./generated/getters";
import { VpcEntity } from "./graph/vpc";
import { SubnetEntity } from "./graph/subnet";
import { SecurityGroupEntity } from "./graph/security-group";
import { classifyEniOwner } from "./graph/eni-owner";
import type {
  SubnetNetworkContext,
  VpcNetworkContext,
  NatGatewayTarget,
  PeeringTarget,
  TransitGatewayTarget,
} from "./graph/network-context";
import { summarizeEndpointPolicy } from "./graph/network-context";

const baseDirectory = join(tmpdir(), "infrascan-ec2-network-");
const account = "123456789012";
const region = "eu-west-1";
const context = { account, region };
const regionNodeId = `${account}-${region}`;

const vpcId = "vpc-0main";
const subnetArn = (id: string) =>
  `arn:aws:ec2:${region}:${account}:subnet/${id}`;

const subnets = {
  public: "subnet-0public",
  private: "subnet-0private",
  isolated: "subnet-0isolated",
  inherited: "subnet-0inherited",
  dead: "subnet-0dead",
};

const fullAccessPolicy = JSON.stringify({
  Statement: [{ Effect: "Allow", Principal: "*", Action: "*", Resource: "*" }],
});
const restrictedPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${account}:role/app` },
      Action: "sqs:SendMessage",
      Resource: "*",
      Condition: { StringEquals: { "aws:SourceVpc": vpcId } },
    },
    {
      Effect: "Deny",
      Principal: "*",
      Action: "sqs:DeleteQueue",
      Resource: "*",
    },
  ],
});

const routeTablesPage1: RouteTable[] = [
  {
    RouteTableId: "rtb-public",
    VpcId: vpcId,
    Associations: [
      {
        RouteTableAssociationId: "rtbassoc-public",
        RouteTableId: "rtb-public",
        SubnetId: subnets.public,
        Main: false,
        AssociationState: { State: "associated" },
      },
    ],
    Routes: [
      {
        DestinationCidrBlock: "10.0.0.0/16",
        GatewayId: "local",
        State: "active",
        Origin: "CreateRouteTable",
      },
      {
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: "igw-0main",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationIpv6CidrBlock: "::/0",
        GatewayId: "igw-0main",
        State: "active",
        Origin: "CreateRoute",
      },
    ],
  },
  {
    RouteTableId: "rtb-private",
    VpcId: vpcId,
    Associations: [
      {
        RouteTableAssociationId: "rtbassoc-private",
        RouteTableId: "rtb-private",
        SubnetId: subnets.private,
        Main: false,
      },
    ],
    Routes: [
      {
        DestinationPrefixListId: "pl-s3",
        GatewayId: "vpce-0s3",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "0.0.0.0/0",
        NatGatewayId: "nat-0main",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "10.1.0.0/16",
        VpcPeeringConnectionId: "pcx-0peer",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "172.16.0.0/12",
        TransitGatewayId: "tgw-0core",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "192.168.0.0/16",
        NatGatewayId: "nat-0deleted",
        State: "blackhole",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "10.0.0.0/16",
        GatewayId: "local",
        State: "active",
        Origin: "CreateRouteTable",
      },
      {
        DestinationIpv6CidrBlock: "::/0",
        EgressOnlyInternetGatewayId: "eigw-0main",
        State: "active",
        Origin: "CreateRoute",
      },
      {
        DestinationCidrBlock: "10.0.200.0/24",
        InstanceId: "i-0firewall",
        InstanceOwnerId: account,
        NetworkInterfaceId: "eni-0web",
        State: "active",
        Origin: "CreateRoute",
      },
    ],
  },
];

const routeTablesPage2: RouteTable[] = [
  {
    RouteTableId: "rtb-isolated",
    VpcId: vpcId,
    Associations: [
      {
        RouteTableAssociationId: "rtbassoc-isolated",
        RouteTableId: "rtb-isolated",
        SubnetId: subnets.isolated,
        Main: false,
      },
    ],
    Routes: [
      {
        DestinationCidrBlock: "10.0.0.0/16",
        GatewayId: "local",
        State: "active",
        Origin: "CreateRouteTable",
      },
      {
        DestinationPrefixListId: "pl-s3",
        GatewayId: "vpce-0s3",
        State: "active",
        Origin: "CreateRoute",
      },
    ],
  },
  {
    RouteTableId: "rtb-main",
    VpcId: vpcId,
    Associations: [
      {
        RouteTableAssociationId: "rtbassoc-main",
        RouteTableId: "rtb-main",
        Main: true,
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
      {
        DestinationCidrBlock: "192.168.10.0/24",
        GatewayId: "vgw-0onprem",
        State: "active",
        Origin: "EnableVgwRoutePropagation",
      },
    ],
  },
  {
    RouteTableId: "rtb-dead",
    VpcId: vpcId,
    Associations: [
      {
        RouteTableAssociationId: "rtbassoc-dead",
        RouteTableId: "rtb-dead",
        SubnetId: subnets.dead,
        Main: false,
      },
    ],
    Routes: [
      {
        DestinationCidrBlock: "10.0.0.0/16",
        GatewayId: "local",
        State: "active",
        Origin: "CreateRouteTable",
      },
      {
        DestinationCidrBlock: "0.0.0.0/0",
        NatGatewayId: "nat-0deleted",
        State: "blackhole",
        Origin: "CreateRoute",
      },
    ],
  },
];

const networkInterfaces: NetworkInterface[] = [
  {
    NetworkInterfaceId: "eni-0nat",
    InterfaceType: "natGateway",
    Description: "Interface for NAT Gateway nat-0main",
    RequesterManaged: true,
    RequesterId: "AWS",
    SubnetId: subnets.public,
    VpcId: vpcId,
    PrivateIpAddress: "10.0.0.10",
    Status: "in-use",
    Association: {
      PublicIp: "54.0.0.1",
      AllocationId: "eipalloc-0nat",
      AssociationId: "eipassoc-0nat",
      IpOwnerId: account,
    },
  },
  {
    NetworkInterfaceId: "eni-0vpce",
    InterfaceType: "vpc_endpoint",
    Description: "VPC Endpoint Interface vpce-0sqs",
    RequesterManaged: true,
    RequesterId: "727180483921",
    SubnetId: subnets.private,
    VpcId: vpcId,
    Status: "in-use",
  },
  {
    NetworkInterfaceId: "eni-0lambda",
    InterfaceType: "lambda",
    Description:
      "AWS Lambda VPC ENI-orders-fn-1a2b3c4d-1111-2222-3333-444455556666",
    RequesterManaged: true,
    RequesterId: "AROAEXAMPLE:orders-fn",
    SubnetId: subnets.private,
    VpcId: vpcId,
    Status: "in-use",
  },
  {
    NetworkInterfaceId: "eni-0web",
    InterfaceType: "interface",
    Description: "",
    SubnetId: subnets.public,
    VpcId: vpcId,
    Status: "in-use",
    SourceDestCheck: false,
    Attachment: {
      AttachmentId: "eni-attach-0web",
      InstanceId: "i-0firewall",
      InstanceOwnerId: account,
      DeviceIndex: 0,
      Status: "attached",
    },
  },
  {
    NetworkInterfaceId: "eni-0alb",
    InterfaceType: "interface",
    Description: "ELB app/web-alb/0123456789abcdef",
    RequesterManaged: true,
    RequesterId: "amazon-elb",
    SubnetId: subnets.public,
    VpcId: vpcId,
    Status: "in-use",
  },
];

function mockScan() {
  const client = EC2Scanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);

  mocked.on(DescribeVpcsCommand).resolves({
    Vpcs: [
      {
        VpcId: vpcId,
        CidrBlock: "10.0.0.0/16",
        DhcpOptionsId: "dopt-0main",
        IsDefault: false,
        State: "available",
        InstanceTenancy: "default",
        CidrBlockAssociationSet: [{ CidrBlock: "10.0.0.0/16" }],
        Ipv6CidrBlockAssociationSet: [{ Ipv6CidrBlock: "2600:1f18:1::/56" }],
      },
    ],
  });
  mocked
    .on(DescribeVpcAttributeCommand, { Attribute: "enableDnsSupport" })
    .resolves({ VpcId: vpcId, EnableDnsSupport: { Value: true } })
    .on(DescribeVpcAttributeCommand, { Attribute: "enableDnsHostnames" })
    .resolves({ VpcId: vpcId, EnableDnsHostnames: { Value: false } });

  const subnet = (
    id: string,
    cidr: string,
    ipv6?: string,
    az = "eu-west-1a",
  ) => ({
    SubnetId: id,
    SubnetArn: subnetArn(id),
    VpcId: vpcId,
    CidrBlock: cidr,
    AvailabilityZone: az,
    State: "available" as const,
    Ipv6CidrBlockAssociationSet:
      ipv6 != null
        ? [
            {
              Ipv6CidrBlock: ipv6,
              Ipv6CidrBlockState: { State: "associated" as const },
            },
          ]
        : undefined,
  });
  mocked.on(DescribeSubnetsCommand).resolves({
    Subnets: [
      subnet(subnets.public, "10.0.0.0/24", "2600:1f18:1:1::/64"),
      subnet(subnets.private, "10.0.1.0/24", "2600:1f18:1:2::/64"),
      subnet(subnets.isolated, "10.0.2.0/24"),
      subnet(subnets.inherited, "10.0.3.0/24", undefined, "eu-west-1b"),
      subnet(subnets.dead, "10.0.4.0/24"),
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
  mocked.on(DescribeLaunchTemplatesCommand).resolves({ LaunchTemplates: [] });
  mocked
    .on(DescribeNetworkInterfacesCommand)
    .resolves({ NetworkInterfaces: networkInterfaces });
  mocked.on(DescribeNatGatewaysCommand).resolves({
    NatGateways: [
      {
        NatGatewayId: "nat-0main",
        SubnetId: subnets.public,
        VpcId: vpcId,
        State: "available",
        ConnectivityType: "public",
        NatGatewayAddresses: [
          {
            AllocationId: "eipalloc-0nat",
            NetworkInterfaceId: "eni-0nat",
            PrivateIp: "10.0.0.10",
            PublicIp: "54.0.0.1",
            IsPrimary: true,
            Status: "succeeded",
          },
        ],
      },
    ],
  });
  mocked
    .on(DescribeRouteTablesCommand, { NextToken: undefined })
    .resolves({ RouteTables: routeTablesPage1, NextToken: "rtb-page-2" })
    .on(DescribeRouteTablesCommand, { NextToken: "rtb-page-2" })
    .resolves({ RouteTables: routeTablesPage2 });
  mocked.on(DescribeInternetGatewaysCommand).resolves({
    InternetGateways: [
      {
        InternetGatewayId: "igw-0main",
        Attachments: [{ VpcId: vpcId, State: "available" }],
      },
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
        VpcEndpointId: "vpce-0sqs",
        VpcEndpointType: "Interface",
        VpcId: vpcId,
        ServiceName: `com.amazonaws.${region}.sqs`,
        State: "available",
        SubnetIds: [subnets.private],
        Groups: [{ GroupId: "sg-0app", GroupName: "app" }],
        NetworkInterfaceIds: ["eni-0vpce"],
        PrivateDnsEnabled: true,
        DnsEntries: [{ DnsName: `vpce-0sqs.sqs.${region}.vpce.amazonaws.com` }],
        PolicyDocument: restrictedPolicy,
      },
      {
        VpcEndpointId: "vpce-0s3",
        VpcEndpointType: "Gateway",
        VpcId: vpcId,
        ServiceName: `com.amazonaws.${region}.s3`,
        State: "available",
        RouteTableIds: ["rtb-private", "rtb-isolated"],
        PolicyDocument: fullAccessPolicy,
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
            NetworkAclAssociationId: "aclassoc-1",
            NetworkAclId: "acl-0default",
            SubnetId: subnets.public,
          },
        ],
        Entries: [
          {
            RuleNumber: 100,
            Protocol: "-1",
            RuleAction: "allow",
            Egress: false,
            CidrBlock: "0.0.0.0/0",
          },
          {
            RuleNumber: 32767,
            Protocol: "-1",
            RuleAction: "deny",
            Egress: false,
            CidrBlock: "0.0.0.0/0",
          },
          {
            RuleNumber: 100,
            Protocol: "-1",
            RuleAction: "allow",
            Egress: true,
            CidrBlock: "0.0.0.0/0",
          },
          {
            RuleNumber: 32767,
            Protocol: "-1",
            RuleAction: "deny",
            Egress: true,
            CidrBlock: "0.0.0.0/0",
          },
        ],
      },
      {
        NetworkAclId: "acl-0isolated",
        VpcId: vpcId,
        IsDefault: false,
        Associations: [
          {
            NetworkAclAssociationId: "aclassoc-2",
            NetworkAclId: "acl-0isolated",
            SubnetId: subnets.isolated,
          },
        ],
        Entries: [
          {
            RuleNumber: 32767,
            Protocol: "-1",
            RuleAction: "deny",
            Egress: false,
            CidrBlock: "0.0.0.0/0",
          },
          {
            RuleNumber: 200,
            Protocol: "6",
            RuleAction: "allow",
            Egress: false,
            CidrBlock: "10.0.0.0/16",
            PortRange: { From: 5432, To: 5432 },
          },
          {
            RuleNumber: 100,
            Protocol: "6",
            RuleAction: "deny",
            Egress: false,
            CidrBlock: "10.0.0.0/24",
            PortRange: { From: 5432, To: 5432 },
          },
          {
            RuleNumber: 100,
            Protocol: "6",
            RuleAction: "allow",
            Egress: true,
            CidrBlock: "10.0.0.0/16",
            PortRange: { From: 1024, To: 65535 },
          },
          {
            RuleNumber: 32767,
            Protocol: "-1",
            RuleAction: "deny",
            Egress: true,
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
          CidrBlock: "10.1.0.0/16",
          CidrBlockSet: [
            { CidrBlock: "10.1.0.0/16" },
            { CidrBlock: "10.2.0.0/16" },
          ],
        },
      },
    ],
  });
  mocked.on(DescribeTransitGatewaysCommand).resolves({
    TransitGateways: [
      {
        TransitGatewayId: "tgw-0core",
        OwnerId: "222222222222",
        State: "available",
        Description: "core network",
        Options: { AmazonSideAsn: 64512 },
      },
    ],
  });
  mocked.on(DescribeTransitGatewayAttachmentsCommand).resolves({
    TransitGatewayAttachments: [
      {
        TransitGatewayAttachmentId: "tgw-attach-0main",
        TransitGatewayId: "tgw-0core",
        TransitGatewayOwnerId: "222222222222",
        ResourceType: "vpc",
        ResourceId: vpcId,
        ResourceOwnerId: account,
        State: "available",
        Association: {
          TransitGatewayRouteTableId: "tgw-rtb-0spoke",
          State: "associated",
        },
      },
      {
        TransitGatewayAttachmentId: "tgw-attach-0other",
        TransitGatewayId: "tgw-0core",
        ResourceType: "vpc",
        ResourceId: "vpc-0other",
        State: "available",
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
        VpcAttachments: [{ VpcId: vpcId, State: "attached" }],
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
          PrefixListName: "corp-egress",
          OwnerId: account,
          AddressFamily: "IPv4",
          MaxEntries: 5,
          State: "create-complete",
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
    .resolves({
      Entries: [{ Cidr: "198.51.100.0/24", Description: "dc" }],
    });
  mocked.on(DescribeDhcpOptionsCommand).resolves({
    DhcpOptions: [
      {
        DhcpOptionsId: "dopt-0main",
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
        LogDestinationType: "cloud-watch-logs",
        LogGroupName: "/vpc/main",
        LogDestination: `arn:aws:logs:${region}:${account}:log-group:/vpc/main`,
        FlowLogStatus: "ACTIVE",
        DeliverLogsStatus: "SUCCESS",
      },
      {
        FlowLogId: "fl-0private",
        ResourceId: subnets.private,
        TrafficType: "REJECT",
        LogDestinationType: "s3",
        LogDestination: "arn:aws:s3:::flow-logs-bucket",
        FlowLogStatus: "ACTIVE",
      },
    ],
  });
  mocked.on(DescribeAddressesCommand).resolves({
    Addresses: [
      {
        AllocationId: "eipalloc-0nat",
        PublicIp: "54.0.0.1",
        AssociationId: "eipassoc-0nat",
        NetworkInterfaceId: "eni-0nat",
        PrivateIpAddress: "10.0.0.10",
        Domain: "vpc",
      },
      {
        AllocationId: "eipalloc-0unused",
        PublicIp: "54.0.0.2",
        Domain: "vpc",
      },
    ],
  });
  return { client, mocked };
}

async function scan() {
  const connector = buildFsConnector(mkdtempSync(baseDirectory));
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

function subnetContext(nodes: Record<string, BaseState[]>, subnetId: string) {
  const node = nodes[SubnetEntity.nodeType].find(
    (candidate) => candidate.$graph.label === subnetId,
  ) as unknown as { networkContext: SubnetNetworkContext };
  return node.networkContext;
}

t.test(
  "New getters paginate and only fetch entries for customer managed prefix lists",
  async ({ equal, same }) => {
    const { mocked } = await scan();

    equal(mocked.commandCalls(DescribeRouteTablesCommand).length, 2);
    equal(
      mocked.commandCalls(DescribeRouteTablesCommand)[1].args[0].input
        .NextToken,
      "rtb-page-2",
    );
    equal(mocked.commandCalls(DescribeManagedPrefixListsCommand).length, 2);
    const entryCalls = mocked.commandCalls(GetManagedPrefixListEntriesCommand);
    equal(entryCalls.length, 2);
    // The generated getter reuses one parameter object per list across pages, so only the final token is visible
    same(
      entryCalls.map((call) => call.args[0].input.PrefixListId),
      ["pl-corp", "pl-corp"],
    );
    equal(entryCalls[1].args[0].input.NextToken, "entries-2");
    const attributeCalls = mocked.commandCalls(DescribeVpcAttributeCommand);
    same(
      attributeCalls.map((call) => call.args[0].input),
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
  },
);

t.test(
  "Subnet tiers, routes and the default egress path are derived and every hop resolves",
  async ({ equal, same, ok, notOk }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    // Existing ids and fields are unchanged
    const subnetNode = nodes[SubnetEntity.nodeType].find(
      (node) => node.$graph.label === subnets.private,
    )!;
    equal(subnetNode.$graph.id, subnetArn(subnets.private));
    equal(subnetNode.resource.id, subnetArn(subnets.private));
    same(subnetNode.network?.vpc, { id: vpcId });
    same(subnetNode.network?.reservedAddresses?.[0], {
      family: "ipv4",
      cidrBlock: "10.0.1.0/24",
    });
    equal(nodes[VpcEntity.nodeType][0].$graph.id, vpcId);

    // The nodes still build into a graph
    const graph = Graph();
    graph.addNode({ $graph: { id: account } } as unknown as BaseState);
    graph.addNode({
      $graph: { id: regionNodeId, parent: account },
    } as unknown as BaseState);
    for (const entity of EC2Scanner.entities ?? []) {
      for (const node of nodes[entity.nodeType]) {
        graph.addNode(node);
      }
    }
    equal(graph.getNode("nat-0main")?.parent?.$graph.id, vpcId);

    const publicCtx = subnetContext(nodes, subnets.public);
    const privateCtx = subnetContext(nodes, subnets.private);
    const isolatedCtx = subnetContext(nodes, subnets.isolated);
    const inheritedCtx = subnetContext(nodes, subnets.inherited);
    const deadCtx = subnetContext(nodes, subnets.dead);

    equal(publicCtx.tier, "public");
    equal(publicCtx.ipv6Tier, "public");
    equal(privateCtx.tier, "private-nat");
    equal(privateCtx.ipv6Tier, "egress-only");
    equal(isolatedCtx.tier, "isolated");
    equal(isolatedCtx.ipv6Tier, "no-ipv6");
    equal(inheritedCtx.tier, "private-tgw");
    equal(deadCtx.tier, "blackhole");

    // Inherited main route table is called out
    equal(inheritedCtx.routeTable?.routeTableId, "rtb-main");
    equal(inheritedCtx.routeTable?.association, "main");
    same(inheritedCtx.routeTable?.propagatingVgwIds, ["vgw-0onprem"]);
    equal(privateCtx.routeTable?.association, "explicit");
    equal(privateCtx.routeTable?.associationId, "rtbassoc-private");
    same(privateCtx.tierBasis.ipv4DefaultRoute, {
      destination: "0.0.0.0/0",
      targetType: "nat",
      targetId: "nat-0main",
      state: "active",
    });

    // Routes are typed, ordered (IPv4 most specific first, IPv6, prefix lists) and their targets described
    const routes = privateCtx.routeTable!.routes;
    same(
      routes.map((route) => [route.destination, route.targetType]),
      [
        ["10.0.200.0/24", "instance"],
        ["10.0.0.0/16", "local"],
        ["10.1.0.0/16", "pcx"],
        ["192.168.0.0/16", "nat"],
        ["172.16.0.0/12", "tgw"],
        ["0.0.0.0/0", "nat"],
        ["::/0", "eigw"],
        ["pl-s3", "vpce"],
      ],
    );
    const pcx = routes.find((route) => route.targetType === "pcx")!;
    same((pcx.target as PeeringTarget).peer, {
      vpcId: "vpc-0peer",
      ownerId: "999999999999",
      region: "us-east-1",
      cidrs: ["10.1.0.0/16", "10.2.0.0/16"],
      ipv6Cidrs: [],
    });
    equal((pcx.target as PeeringTarget).localRole, "requester");
    const tgw = routes.find((route) => route.targetType === "tgw")!;
    equal(
      (tgw.target as TransitGatewayTarget).attachment
        ?.transitGatewayAttachmentId,
      "tgw-attach-0main",
    );
    equal((tgw.target as TransitGatewayTarget).amazonSideAsn, 64512);
    const blackhole = routes.find(
      (route) => route.destination === "192.168.0.0/16",
    )!;
    equal(blackhole.state, "blackhole");
    notOk(blackhole.resolved);
    const s3Route = routes.find((route) => route.targetType === "vpce")!;
    equal(s3Route.destinationPrefixListName, `com.amazonaws.${region}.s3`);
    same(privateCtx.prefixLists["pl-s3"], {
      resolved: true,
      name: `com.amazonaws.${region}.s3`,
      ownerId: "AWS",
      addressFamily: "IPv4",
      maxEntries: undefined,
      state: undefined,
      entries: undefined,
    });
    const instanceRoute = routes.find(
      (route) => route.targetType === "instance",
    )!;
    equal(instanceRoute.targetId, "i-0firewall");
    equal(instanceRoute.targetNodeId, "eni-0web");

    // Traversal: private subnet -> NAT -> public subnet -> IGW
    const egress = privateCtx.defaultEgress.ipv4;
    equal(egress.status, "internet");
    same(egress.exit, { targetType: "igw", targetId: "igw-0main" });
    same(
      egress.hops.map((hop) => [
        hop.subnetId,
        hop.routeTableId,
        hop.targetType,
        hop.targetId,
      ]),
      [
        [subnets.private, "rtb-private", "nat", "nat-0main"],
        [subnets.public, "rtb-public", "igw", "igw-0main"],
      ],
    );
    const natTarget = routes.find((route) => route.destination === "0.0.0.0/0")!
      .target as NatGatewayTarget;
    equal(natTarget.subnetId, subnets.public);
    equal(natTarget.subnetNodeId, subnetArn(subnets.public));
    same(natTarget.publicIps, ["54.0.0.1"]);

    // Every hop resolves to a graph node or something described in the VPC context
    const vpcCtx = (
      graph.getNode(vpcId) as unknown as { networkContext: VpcNetworkContext }
    ).networkContext;
    for (const hop of egress.hops) {
      ok(hop.resolved);
      ok(graph.getNode(hop.subnetNodeId!), `subnet node ${hop.subnetNodeId}`);
      if (hop.targetNodeId != null) {
        ok(graph.getNode(hop.targetNodeId), `target node ${hop.targetNodeId}`);
      }
      if (hop.targetType === "igw") {
        ok(
          vpcCtx.internetGateways.some(
            (igw) => igw.internetGatewayId === hop.targetId,
          ),
        );
      }
      if (hop.targetType === "nat") {
        ok(vpcCtx.natGateways.some((nat) => nat.natGatewayId === hop.targetId));
      }
    }

    // IPv6 leaves via the egress-only IGW, the public subnet via the IGW
    equal(privateCtx.defaultEgress.ipv6.status, "internet-egress-only");
    equal(publicCtx.defaultEgress.ipv6.status, "internet");
    equal(publicCtx.defaultEgress.ipv4.hops.length, 1);

    // Isolated, blackholed and TGW subnets
    equal(isolatedCtx.defaultEgress.ipv4.status, "no-default-route");
    equal(isolatedCtx.defaultEgress.ipv6.status, "no-default-route");
    equal(deadCtx.defaultEgress.ipv4.status, "blackhole");
    ok(deadCtx.defaultEgress.ipv4.issues[0].includes("blackhole"));
    equal(inheritedCtx.defaultEgress.ipv4.status, "private-network");
    same(inheritedCtx.defaultEgress.ipv4.exit, {
      targetType: "tgw",
      targetId: "tgw-0core",
    });

    // Private service access
    same(
      privateCtx.privateServiceAccess.gatewayEndpoints.map((endpoint) => [
        endpoint.vpcEndpointId,
        endpoint.prefixListId,
        endpoint.prefixListName,
        endpoint.policy.fullAccess,
      ]),
      [["vpce-0s3", "pl-s3", `com.amazonaws.${region}.s3`, true]],
    );
    equal(isolatedCtx.privateServiceAccess.gatewayEndpoints.length, 1);
    equal(publicCtx.privateServiceAccess.gatewayEndpoints.length, 0);
    const sqsPrivate = privateCtx.privateServiceAccess.interfaceEndpoints[0];
    equal(sqsPrivate.vpcEndpointId, "vpce-0sqs");
    equal(sqsPrivate.reachableVia, "in-subnet");
    same(sqsPrivate.networkInterfaceIds, ["eni-0vpce"]);
    same(sqsPrivate.securityGroupIds, ["sg-0app"]);
    equal(sqsPrivate.policy.fullAccess, false);
    same(sqsPrivate.policy.conditionKeys, ["aws:SourceVpc"]);
    equal(
      publicCtx.privateServiceAccess.interfaceEndpoints[0].reachableVia,
      "vpc-local-route",
    );

    // NACLs, ordered by rule number
    equal(isolatedCtx.networkAcl?.networkAclId, "acl-0isolated");
    equal(isolatedCtx.networkAcl?.association, "explicit");
    equal(isolatedCtx.networkAcl?.isDefault, false);
    same(
      isolatedCtx.networkAcl?.inbound.map((rule) => [
        rule.ruleNumber,
        rule.action,
        rule.protocol,
      ]),
      [
        [100, "deny", "tcp"],
        [200, "allow", "tcp"],
        [32767, "deny", "all"],
      ],
    );
    equal(isolatedCtx.networkAcl?.inbound[2].isDefaultRule, true);
    equal(privateCtx.networkAcl?.networkAclId, "acl-0default");
    equal(privateCtx.networkAcl?.association, "default-inferred");

    // Flow logs covering the subnet, directly or via the VPC
    same(
      privateCtx.flowLogs.map((flowLog) => [flowLog.flowLogId, flowLog.scope]),
      [
        ["fl-0private", "subnet"],
        ["fl-0vpc", "vpc"],
      ],
    );
    same(
      publicCtx.flowLogs.map((flowLog) => flowLog.flowLogId),
      ["fl-0vpc"],
    );
  },
);

t.test("VPC network context", async ({ equal, same, ok }) => {
  const { connector } = await scan();
  const nodes = await buildNodes(connector);
  const vpcNode = nodes[VpcEntity.nodeType][0] as unknown as {
    networkContext: VpcNetworkContext;
    vpc: Record<string, unknown>;
    network: unknown;
  };
  const ctx = vpcNode.networkContext;

  // Existing component unchanged, DNS attributes now populated
  equal(vpcNode.vpc.dhcpOptionsId, "dopt-0main");
  equal(vpcNode.vpc.enableDnsSupport, true);
  equal(vpcNode.vpc.enableDnsHostnames, false);
  same(vpcNode.network, {
    reservedAddresses: [
      { family: "ipv4", cidrBlock: "10.0.0.0/16" },
      { family: "ipv4", cidrBlock: "10.0.0.0/16" },
      { family: "ipv6", cidrBlock: "2600:1f18:1::/56" },
    ],
  });

  same(ctx.cidrs, { ipv4: ["10.0.0.0/16"], ipv6: ["2600:1f18:1::/56"] });
  same(ctx.dns, { enableDnsSupport: true, enableDnsHostnames: false });
  same(ctx.dhcpOptions?.domainNameServers, ["AmazonProvidedDNS"]);
  same(ctx.dhcpOptions?.domainName, [`${region}.compute.internal`]);
  equal(ctx.mainRouteTableId, "rtb-main");
  same(
    ctx.routeTables.map((table) => [
      table.routeTableId,
      table.main,
      table.associatedSubnetIds,
    ]),
    [
      ["rtb-dead", false, [subnets.dead]],
      ["rtb-isolated", false, [subnets.isolated]],
      ["rtb-main", true, []],
      ["rtb-private", false, [subnets.private]],
      ["rtb-public", false, [subnets.public]],
    ],
  );
  // VPC routes stay compact: targets are described once in the VPC lists
  equal(
    ctx.routeTables.flatMap((table) => table.routes).some((r) => r.target),
    false,
  );
  same(
    ctx.subnets.map((subnet) => [subnet.subnetId, subnet.tier]),
    [
      [subnets.dead, "blackhole"],
      [subnets.inherited, "private-tgw"],
      [subnets.isolated, "isolated"],
      [subnets.private, "private-nat"],
      [subnets.public, "public"],
    ],
  );
  equal(ctx.subnets[0].subnetNodeId, subnetArn(subnets.dead));
  same(ctx.internetGateways, [
    { internetGatewayId: "igw-0main", attachmentState: "available" },
  ]);
  same(ctx.egressOnlyInternetGateways, [
    { egressOnlyInternetGatewayId: "eigw-0main", attachmentState: "attached" },
  ]);
  equal(ctx.natGateways[0].connectivityType, "public");
  same(ctx.natGateways[0].allocationIds, ["eipalloc-0nat"]);
  same(
    ctx.vpcEndpoints.map((endpoint) => [
      endpoint.vpcEndpointId,
      endpoint.endpointType,
    ]),
    [
      ["vpce-0s3", "Gateway"],
      ["vpce-0sqs", "Interface"],
    ],
  );
  equal(ctx.peeringConnections[0].peer.vpcId, "vpc-0peer");
  same(
    ctx.transitGatewayAttachments.map((a) => a.transitGatewayAttachmentId),
    ["tgw-attach-0main"],
  );
  equal(ctx.transitGatewayAttachments[0].transitGateway?.amazonSideAsn, 64512);
  equal(ctx.vpnGateways[0].vpnGatewayId, "vgw-0onprem");
  ok(ctx.vpnGateways[0].attachedToVpc);
  same(
    ctx.flowLogs.map((flowLog) => flowLog.flowLogId),
    ["fl-0private", "fl-0vpc"],
  );
  same(
    ctx.elasticIps.map((eip) => [eip.allocationId, eip.ownedBy?.kind]),
    [["eipalloc-0nat", "nat_gateway"]],
  );
  same(Object.keys(ctx.prefixLists), ["pl-corp", "pl-s3"]);
  same(ctx.prefixLists["pl-corp"].entries, [
    { cidr: "198.51.100.0/24", description: "dc" },
    { cidr: "203.0.113.0/24", description: "office" },
  ]);

  // Deterministic output
  const again = await buildNodes(connector);
  same(
    JSON.stringify(again[VpcEntity.nodeType]),
    JSON.stringify(nodes[VpcEntity.nodeType]),
  );
  same(
    JSON.stringify(again[SubnetEntity.nodeType]),
    JSON.stringify(nodes[SubnetEntity.nodeType]),
  );
});

t.test(
  "Security group, network interface and NAT gateway context",
  async ({ equal, same }) => {
    const { connector } = await scan();
    const nodes = await buildNodes(connector);

    const group = nodes[SecurityGroupEntity.nodeType][0] as unknown as {
      network: {
        rules: { protocol?: string; fromPort?: number }[];
        egressRules: {
          protocol?: string;
          awsConfig?: { prefixLists?: { prefixListId?: string }[] };
          permittedIpRanges?: { cidrBlock?: string }[];
        }[];
      };
    };
    // inbound unchanged
    same(
      group.network.rules.map((rule) => [rule.protocol, rule.fromPort]),
      [["tcp", 443]],
    );
    equal(group.network.egressRules.length, 2);
    equal(group.network.egressRules[0].protocol, "ALL");
    equal(
      group.network.egressRules[0].permittedIpRanges?.[0].cidrBlock,
      "0.0.0.0/0",
    );
    equal(
      group.network.egressRules[1].awsConfig?.prefixLists?.[0].prefixListId,
      "pl-corp",
    );

    const owners = Object.fromEntries(
      nodes["ec2-network-interface"].map((node) => [
        node.$graph.id,
        (node as unknown as { networkInterface: { owner: unknown } })
          .networkInterface.owner,
      ]),
    );
    same(owners, {
      "eni-0nat": {
        kind: "nat_gateway",
        id: "nat-0main",
        inferredFrom: "interfaceType",
      },
      "eni-0vpce": {
        kind: "vpc_endpoint",
        id: "vpce-0sqs",
        inferredFrom: "interfaceType",
      },
      "eni-0lambda": {
        kind: "lambda",
        id: "orders-fn",
        inferredFrom: "interfaceType",
      },
      "eni-0web": {
        kind: "ec2_instance",
        id: "i-0firewall",
        inferredFrom: "attachment",
      },
      "eni-0alb": {
        kind: "load_balancer",
        id: "app/web-alb/0123456789abcdef",
        inferredFrom: "description",
      },
    });
    const natEni = nodes["ec2-network-interface"].find(
      (node) => node.$graph.id === "eni-0nat",
    ) as unknown as {
      networkInterface: Record<string, unknown>;
      network: { publicIp?: unknown };
    };
    equal(natEni.networkInterface.requesterManaged, true);
    same(natEni.networkInterface.elasticIp, {
      allocationId: "eipalloc-0nat",
      associationId: "eipassoc-0nat",
      ipOwnerId: account,
    });
    // existing network component unchanged
    same(natEni.network.publicIp, { status: "enabled", address: "54.0.0.1" });

    const nat = nodes["ec2-nat-gateway"][0] as unknown as {
      natGateway: { connectivityType?: string; subnetId?: string };
    };
    equal(nat.natGateway.connectivityType, "public");
    equal(nat.natGateway.subnetId, subnets.public);
  },
);

t.test(
  "Missing and partial network state is handled without throwing",
  async ({ equal, same, ok }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const client = EC2Scanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(DescribeVpcsCommand).resolves({
      Vpcs: [{ VpcId: vpcId, CidrBlock: "10.0.0.0/16" }],
    });
    mocked.on(DescribeSubnetsCommand).resolves({
      Subnets: [
        {
          SubnetId: subnets.private,
          SubnetArn: subnetArn(subnets.private),
          VpcId: vpcId,
          CidrBlock: "10.0.1.0/24",
        },
      ],
    });
    // State from a scan that predates the network getters: only VPCs and subnets were recorded
    await DescribeVpcs(client, connector, context);
    await DescribeSubnets(client, connector, context);
    const nodes = await buildNodes(connector);
    const ctx = subnetContext(nodes, subnets.private);
    equal(ctx.tier, "unknown");
    equal(ctx.routeTable, undefined);
    equal(ctx.defaultEgress.ipv4.status, "unknown");
    equal(ctx.networkAcl, undefined);
    same(ctx.flowLogs, []);
    const vpcCtx = (
      nodes[VpcEntity.nodeType][0] as unknown as {
        networkContext: VpcNetworkContext;
      }
    ).networkContext;
    same(vpcCtx.dns, {});
    same(vpcCtx.routeTables, []);
    equal(vpcCtx.subnets[0].tier, "unknown");

    // Every getter ran but found nothing, apart from a route table referencing targets that weren't scanned
    mocked.onAnyCommand().resolves({});
    mocked.on(DescribeVpcsCommand).resolves({
      Vpcs: [{ VpcId: vpcId, CidrBlock: "10.0.0.0/16" }],
    });
    mocked.on(DescribeSubnetsCommand).resolves({
      Subnets: [
        {
          SubnetId: subnets.private,
          SubnetArn: subnetArn(subnets.private),
          VpcId: vpcId,
          CidrBlock: "10.0.1.0/24",
        },
      ],
    });
    mocked.on(DescribeRouteTablesCommand).resolves({
      RouteTables: [
        {
          RouteTableId: "rtb-partial",
          VpcId: vpcId,
          Associations: [{ Main: true, RouteTableId: "rtb-partial" }],
          Routes: [
            {
              DestinationCidrBlock: "0.0.0.0/0",
              NatGatewayId: "nat-0missing",
              State: "active",
            },
            {
              DestinationPrefixListId: "pl-unknown",
              GatewayId: "vpce-0missing",
              State: "active",
            },
          ],
        },
      ],
    });
    for (const getter of EC2Scanner.getters) {
      await getter(client, connector, context);
    }
    const partial = subnetContext(await buildNodes(connector), subnets.private);
    equal(partial.tier, "private-nat");
    equal(partial.routeTable?.association, "main");
    equal(partial.defaultEgress.ipv4.status, "unresolved");
    ok(partial.defaultEgress.ipv4.issues[0].includes("nat-0missing"));
    equal(partial.defaultEgress.ipv4.hops[0].resolved, false);
    same(partial.prefixLists, { "pl-unknown": { resolved: false } });

    // Translating state without an inventory leaves the component unset
    const [translated] = SubnetEntity.translate({
      _metadata: { account, region, timestamp: 1 },
      _parameters: {},
      _result: { Subnets: [{ SubnetId: subnets.private }] },
    } as never);
    equal(SubnetEntity.components.networkContext!(translated), undefined);
  },
);

t.test("Endpoint policy summaries and ENI owner fallbacks", async (tt) => {
  tt.same(summarizeEndpointPolicy(undefined), { present: false });
  tt.same(summarizeEndpointPolicy("{not json"), {
    present: true,
    parseError: true,
  });
  tt.equal(summarizeEndpointPolicy(fullAccessPolicy).fullAccess, true);
  const restricted = summarizeEndpointPolicy(restrictedPolicy);
  tt.equal(restricted.statementCount, 2);
  tt.equal(restricted.denyStatements, 1);
  tt.equal(restricted.restrictsPrincipals, true);

  tt.same(classifyEniOwner({ Status: "available" }), {
    kind: "unattached",
    inferredFrom: "status",
  });
  tt.same(
    classifyEniOwner({
      Description: "RDSNetworkInterface",
      RequesterManaged: true,
      RequesterId: "amazon-rds",
    }),
    { kind: "rds", id: undefined, inferredFrom: "description" },
  );
  tt.same(
    classifyEniOwner({ RequesterManaged: true, RequesterId: "amazon-x" }),
    { kind: "aws_managed", id: "amazon-x", inferredFrom: "status" },
  );
  tt.same(
    classifyEniOwner({
      InterfaceType: "transit_gateway",
      Description:
        "Network Interface for Transit Gateway Attachment tgw-attach-0abc",
    }),
    {
      kind: "transit_gateway",
      id: "tgw-attach-0abc",
      inferredFrom: "interfaceType",
    },
  );
});
