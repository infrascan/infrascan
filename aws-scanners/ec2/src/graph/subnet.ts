import {
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
  Subnet as Ec2Subnet,
  SubnetState as Ec2SubnetState,
  PrivateDnsNameOptionsOnLaunch,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
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
