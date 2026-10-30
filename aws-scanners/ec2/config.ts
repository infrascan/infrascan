import * as EC2 from "@aws-sdk/client-ec2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type EC2Functions =
  | "DescribeVpcs"
  | "DescribeAvailabilityZones"
  | "DescribeSubnets"
  | "DescribeSecurityGroups"
  | "DescribeLaunchTemplates"
  | "DescribeLaunchTemplateVersions"
  | "DescribeNetworkInterfaces"
  | "DescribeNatGateways"
  | "DescribeVpcAttribute"
  | "DescribeRouteTables"
  | "DescribeInternetGateways"
  | "DescribeEgressOnlyInternetGateways"
  | "DescribeVpcEndpoints"
  | "DescribeNetworkAcls"
  | "DescribeVpcPeeringConnections"
  | "DescribeTransitGateways"
  | "DescribeTransitGatewayAttachments"
  | "DescribeVpnGateways"
  | "DescribeManagedPrefixLists"
  | "GetManagedPrefixListEntries"
  | "DescribeDhcpOptions"
  | "DescribeFlowLogs"
  | "DescribeAddresses";
const CloudWatchLogsScanner: ScannerDefinition<
  "EC2",
  typeof EC2,
  EC2Functions
> = {
  provider: "aws",
  service: "ec2",
  clientKey: "EC2",
  key: "EC2-Networking",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeVpcs",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeSubnets",
      parameters: [
        {
          Key: "Filters",
          Selector: "EC2|DescribeVpcs|[]._result.Vpcs[].VpcId",
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeSecurityGroups",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeLaunchTemplates",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeLaunchTemplateVersions",
      parameters: [
        {
          Key: "LaunchTemplateId",
          Selector:
            "EC2|DescribeLaunchTemplates|[]._result.LaunchTemplates[].LaunchTemplateId",
        },
        {
          Key: "Versions",
          Value: ["$Latest", "$Default"],
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeNetworkInterfaces",
      parameters: [
        {
          Key: "MaxResults",
          Value: 10,
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeNatGateways",
      parameters: [
        {
          Key: "MaxResults",
          Value: 10,
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    // DescribeVpcAttribute takes a single attribute per call, so each VPC is queried twice: the
    // two selectors below are zipped by index into (VpcId, Attribute) pairs:
    // [vpc-a, vpc-a, vpc-b, vpc-b] x [enableDnsSupport, enableDnsHostnames, enableDnsSupport, ...]
    {
      fn: "DescribeVpcAttribute",
      parameters: [
        {
          Key: "VpcId",
          Selector: "EC2|DescribeVpcs|[]._result.Vpcs[].[VpcId, VpcId][]",
        },
        {
          Key: "Attribute",
          Selector:
            "EC2|DescribeVpcs|[]._result.Vpcs[].['enableDnsSupport', 'enableDnsHostnames'][]",
        },
      ],
    },
    {
      fn: "DescribeRouteTables",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeInternetGateways",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeEgressOnlyInternetGateways",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeVpcEndpoints",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeNetworkAcls",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeVpcPeeringConnections",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeTransitGateways",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeTransitGatewayAttachments",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeVpnGateways",
    },
    {
      fn: "DescribeManagedPrefixLists",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    // Entries are only fetched for customer managed lists, which are bounded by their MaxEntries.
    // AWS managed lists (e.g. com.amazonaws.<region>.s3) are identified by name alone.
    {
      fn: "GetManagedPrefixListEntries",
      parameters: [
        {
          Key: "PrefixListId",
          Selector:
            "EC2|DescribeManagedPrefixLists|[]._result.PrefixLists[?OwnerId != 'AWS'].PrefixListId[]",
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeDhcpOptions",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeFlowLogs",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeAddresses",
    },
  ],
};

export default CloudWatchLogsScanner;
