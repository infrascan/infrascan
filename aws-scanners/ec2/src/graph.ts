import {
  DescribeSecurityGroupsCommandInput,
  DescribeSecurityGroupsCommandOutput,
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
  DescribeVpcsCommandInput,
  DescribeVpcsCommandOutput,
  Subnet as Ec2Subnet,
  SubnetState as Ec2SubnetState,
  Vpc as Ec2Vpc,
  VpcState as Ec2VpcState,
  PrivateDnsNameOptionsOnLaunch,
  SecurityGroup,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  Connector,
  IpRange,
  NetworkRule,
  ReservedAddresses,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface SubnetOnLaunch {
  publicIp?: boolean;
  customerOwnedIp?: boolean;
  privateDns?: PrivateDnsNameOptionsOnLaunch;
}

export interface Subnet {
  outpostArn?: string;
  isDefault?: boolean;
  onLaunch?: SubnetOnLaunch;
  enableDns64?: boolean;
  state?: Ec2SubnetState;
  assignIpv6?: boolean;
  enablLniAtDeviceIndex?: number;
}

export interface SubnetState extends BaseState<DescribeSubnetsCommandInput> {
  subnet: Subnet;
}

export interface VpcConfig {
  isDefault?: boolean;
  instanceTenancy?: string;
  state?: Ec2VpcState;
  enableDnsHostnames?: boolean;
  enableDnsSupport?: boolean;
  dhcpOptionsId?: string;
}

export interface VpcState extends BaseState<DescribeVpcsCommandInput> {
  vpc: VpcConfig;
}

export const SubnetEntity: TranslatedEntity<
  SubnetState,
  State<DescribeSubnetsCommandOutput, DescribeSubnetsCommandInput>,
  WithCallContext<Ec2Subnet, DescribeSubnetsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-subnet",
  provider: "aws",
  command: "DescribeSubnets",
  category: "ec2",
  subcategory: "subnet",
  nodeType: "ec2-subnet",
  selector: "EC2|DescribeSubnets|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      SubnetEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    return (
      val._result.Subnets?.map((subnet) => ({
        $parameters: val._parameters,
        $metadata: val._metadata,
        ...subnet,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: SubnetEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.SubnetArn!,
        label: val.SubnetId!,
        nodeClass: "informational",
        nodeType: SubnetEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: SubnetEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    resource(val) {
      return {
        id: val.SubnetArn!,
        name: val.SubnetId!,
        category: SubnetEntity.category,
        subcategory: SubnetEntity.subcategory,
      };
    },
    $source(val) {
      return {
        command: SubnetEntity.command,
        parameters: val.$parameters,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZone != null ? [val.AvailabilityZone] : undefined,
      };
    },
    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    subnet(val) {
      return {
        state: val.State,
        isDefault: val.DefaultForAz,
        onLaunch: {
          publicIp: val.MapPublicIpOnLaunch,
          customerOwnedIp: val.MapCustomerOwnedIpOnLaunch,
          privateDns: val.PrivateDnsNameOptionsOnLaunch,
        },
        enableDns64: val.EnableDns64,
        assignIpv6: val.AssignIpv6AddressOnCreation,
        enablLniAtDeviceIndex: val.EnableLniAtDeviceIndex,
      };
    },

    network(val) {
      const addresses: ReservedAddresses[] = [];
      if (val.CidrBlock != null) {
        addresses.push({ family: "ipv4", cidrBlock: val.CidrBlock });
      }
      if (val.CustomerOwnedIpv4Pool != null) {
        addresses.push({
          family: "ipv4",
          cidrBlock: val.CustomerOwnedIpv4Pool,
        });
      }
      if (
        val.Ipv6CidrBlockAssociationSet != null &&
        val.Ipv6CidrBlockAssociationSet.length > 0
      ) {
        val.Ipv6CidrBlockAssociationSet.forEach((ipv6Assoc) => {
          if (ipv6Assoc.Ipv6CidrBlock != null) {
            addresses.push({
              family: "ipv6",
              cidrBlock: ipv6Assoc.Ipv6CidrBlock,
            });
          }
        });
      }

      return {
        reservedAddresses: addresses,
        subnet: {
          ipv6Only: val.Ipv6Native,
          availableAddressCount: val.AvailableIpAddressCount,
        },
      };
    },
  },
};

export const SecurityGroupEntity: TranslatedEntity<
  BaseState<unknown>,
  State<
    DescribeSecurityGroupsCommandOutput,
    DescribeSecurityGroupsCommandInput
  >,
  WithCallContext<SecurityGroup, DescribeSecurityGroupsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-security-group",
  provider: "aws",
  command: "DescribeSecurityGroups",
  category: "ec2",
  subcategory: "security-group",
  nodeType: "ec2-security-group",
  selector: "EC2|DescribeSecurityGroups|[]",

  translate(
    val: State<
      DescribeSecurityGroupsCommandOutput,
      DescribeSecurityGroupsCommandInput
    >,
  ) {
    return (
      val._result.SecurityGroups?.map((group) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...group,
      })) ?? []
    );
  },

  getState(state: Connector, context: AwsContext) {
    return evaluateSelector(
      context.account,
      context.region,
      SecurityGroupEntity.selector,
      state,
    );
  },
  components: {
    $metadata(val) {
      return {
        version: SecurityGroupEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.GroupId!,
        label: val.GroupName!,
        nodeClass: "informational",
        nodeType: SecurityGroupEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    tenant(val) {
      return {
        provider: SecurityGroupEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    resource(val) {
      return {
        id: val.GroupId!,
        name: val.GroupName!,
        category: SecurityGroupEntity.category,
        subcategory: SecurityGroupEntity.subcategory,
        description: val.Description,
      };
    },
    tags(val) {
      return val.Tags?.map((tag) => ({ key: tag.Key, value: tag.Value }));
    },
    $source(val) {
      return {
        command: SecurityGroupEntity.command,
        parameters: val.$parameters,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
      };
    },
    audit(val) {
      return {
        createdBy: val.OwnerId,
      };
    },
    network(val) {
      const networkRules: NetworkRule[] =
        val.IpPermissions?.map((rules) => {
          const ipv4Ranges: IpRange[] =
            rules.IpRanges?.map((range) => ({
              family: "ipv4",
              cidrBlock: range.CidrIp,
              description: range.Description,
            })) ?? [];

          const ipv6Ranges: IpRange[] =
            rules.Ipv6Ranges?.map((range) => ({
              family: "ipv6",
              cidrBlock: range.CidrIpv6,
              description: range.Description,
            })) ?? [];

          const referencedSecGroups = rules.UserIdGroupPairs?.map(
            (referencedAcc) => ({
              description: referencedAcc.Description,
              securityGroupId: referencedAcc.GroupId,
              securityGroupName: referencedAcc.GroupName,
              referencedAccountId: referencedAcc.UserId,
              referencedVpcId: referencedAcc.VpcId,
              vpcPeeringStatus: referencedAcc.PeeringStatus,
              vpcPeeringConnectionId: referencedAcc.VpcPeeringConnectionId,
            }),
          );

          return {
            fromPort: rules.FromPort,
            toPort: rules.ToPort,
            protocol: rules.IpProtocol === "-1" ? "ALL" : rules.IpProtocol,
            permittedIpRanges: ipv4Ranges.concat(ipv6Ranges),
            awsConfig: {
              referencedSecurityGroups: referencedSecGroups,
              prefixLists: rules.PrefixListIds?.map((prefix) => ({
                prefixListId: prefix.PrefixListId,
                description: prefix.Description,
              })),
            },
          };
        }) ?? [];

      return {
        rules: networkRules,
      };
    },
  },
};

export const VpcEntity: TranslatedEntity<
  VpcState,
  State<DescribeVpcsCommandOutput, DescribeVpcsCommandInput>,
  WithCallContext<Ec2Vpc, DescribeVpcsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-vpc",
  provider: "aws",
  command: "DescribeVpcs",
  category: "ec2",
  subcategory: "vpc",
  nodeType: "ec2-vpc",
  selector: "EC2|DescribeVpcs|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      VpcEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    return (
      val._result.Vpcs?.map((vpc) => ({
        $parameters: val._parameters,
        $metadata: val._metadata,
        ...vpc,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: VpcEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.VpcId!,
        label: val.VpcId!,
        nodeClass: "informational",
        nodeType: VpcEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: VpcEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    resource(val) {
      return {
        id: val.VpcId!,
        name: val.VpcId!,
        category: VpcEntity.category,
        subcategory: VpcEntity.subcategory,
      };
    },
    $source(val) {
      return {
        command: VpcEntity.command,
        parameters: val.$parameters,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
      };
    },
    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    vpc(val) {
      return {
        state: val.State,
        isDefault: val.IsDefault,
        instanceTenancy: val.InstanceTenancy,
        dhcpOptionsId: val.DhcpOptionsId,
      };
    },

    network(val) {
      const vpcAddresses: ReservedAddresses[] = [];
      if (val.CidrBlock != null) {
        vpcAddresses.push({ family: "ipv4", cidrBlock: val.CidrBlock });
      }

      if (
        val.CidrBlockAssociationSet != null &&
        val.CidrBlockAssociationSet.length > 0
      ) {
        val.CidrBlockAssociationSet.forEach((ipv4Assoc) => {
          if (ipv4Assoc.CidrBlock != null) {
            vpcAddresses.push({
              family: "ipv4",
              cidrBlock: ipv4Assoc.CidrBlock,
            });
          }
        });
      }

      if (
        val.Ipv6CidrBlockAssociationSet != null &&
        val.Ipv6CidrBlockAssociationSet.length > 0
      ) {
        val.Ipv6CidrBlockAssociationSet.forEach((ipv6Assoc) => {
          if (ipv6Assoc.Ipv6CidrBlock != null) {
            vpcAddresses.push({
              family: "ipv6",
              cidrBlock: ipv6Assoc.Ipv6CidrBlock,
            });
          }
        });
      }

      return {
        reservedAddresses: vpcAddresses,
      };
    },
  },
};
