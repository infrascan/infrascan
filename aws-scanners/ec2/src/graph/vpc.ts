import {
  DescribeVpcsCommandInput,
  DescribeVpcsCommandOutput,
  Vpc as Ec2Vpc,
  VpcState as Ec2VpcState,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  ReservedAddresses,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import {
  buildVpcNetworkContext,
  type VpcNetworkContext,
} from "./network-context";
import {
  loadNetworkInventory,
  type NetworkInventory,
} from "./network-inventory";

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
  /**
   * Routing, gateway, endpoint, peering, transit gateway, DNS/DHCP and flow log context for the VPC
   */
  networkContext?: VpcNetworkContext;
}

/**
 * Raw DescribeVpcs state, enriched with the network inventory scanned for the same account and region
 */
export type VpcRawState = State<
  DescribeVpcsCommandOutput,
  DescribeVpcsCommandInput
> & {
  $network?: NetworkInventory;
};

type VpcWithContext = Ec2Vpc & {
  $networkContext?: VpcNetworkContext;
};

export const VpcEntity: TranslatedEntity<
  VpcState,
  VpcRawState,
  WithCallContext<VpcWithContext, DescribeVpcsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-vpc",
  provider: "aws",
  command: "DescribeVpcs",
  category: "ec2",
  subcategory: "vpc",
  nodeType: "ec2-vpc",
  selector: "EC2|DescribeVpcs|[]",

  async getState(stateConnector, context) {
    const [vpcsState, inventory] = await Promise.all([
      evaluateSelector<Serialized<VpcRawState>>(
        context.account,
        context.region,
        VpcEntity.selector,
        stateConnector,
      ),
      loadNetworkInventory(stateConnector, context),
    ]);
    return (vpcsState ?? []).map((vpcState) => ({
      ...vpcState,
      $network: inventory,
    }));
  },

  translate(val) {
    return (
      val._result.Vpcs?.map((vpc) => ({
        $parameters: val._parameters,
        $metadata: val._metadata,
        ...vpc,
        $networkContext:
          val.$network != null && vpc.VpcId != null
            ? buildVpcNetworkContext(val.$network, vpc)
            : undefined,
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
        enableDnsSupport: val.$networkContext?.dns.enableDnsSupport,
        enableDnsHostnames: val.$networkContext?.dns.enableDnsHostnames,
      };
    },

    networkContext(val) {
      return val.$networkContext;
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
