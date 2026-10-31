import {
  DescribeVpcAttributeCommandInput,
  DescribeVpcAttributeResult,
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

/**
 * DescribeVpcs state joined with the DescribeVpcAttribute results for the same account and region
 */
export type VpcRawState = State<
  DescribeVpcsCommandOutput,
  DescribeVpcsCommandInput
> & {
  $attributes?: Serialized<
    State<DescribeVpcAttributeResult, DescribeVpcAttributeCommandInput>
  >[];
};

type VpcWithAttributes = Ec2Vpc & {
  $enableDnsSupport?: boolean;
  $enableDnsHostnames?: boolean;
};

export const VpcEntity: TranslatedEntity<
  VpcState,
  VpcRawState,
  WithCallContext<VpcWithAttributes, DescribeVpcsCommandInput>
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
    const [vpcsState, attributesState] = await Promise.all([
      evaluateSelector<Serialized<VpcRawState>>(
        context.account,
        context.region,
        VpcEntity.selector,
        stateConnector,
      ),
      evaluateSelector<
        Serialized<
          State<DescribeVpcAttributeResult, DescribeVpcAttributeCommandInput>
        >
      >(
        context.account,
        context.region,
        "EC2|DescribeVpcAttribute|[]",
        stateConnector,
      ),
    ]);
    return (vpcsState ?? []).map((vpcState) => ({
      ...vpcState,
      $attributes: attributesState ?? [],
    }));
  },

  translate(val) {
    return (
      val._result.Vpcs?.map((vpc) => {
        const attributes = (val.$attributes ?? [])
          .map((attributeState) => attributeState._result)
          .filter((result) => result?.VpcId === vpc.VpcId);
        return {
          $parameters: val._parameters,
          $metadata: val._metadata,
          ...vpc,
          $enableDnsSupport: attributes.find(
            (result) => result?.EnableDnsSupport != null,
          )?.EnableDnsSupport?.Value,
          $enableDnsHostnames: attributes.find(
            (result) => result?.EnableDnsHostnames != null,
          )?.EnableDnsHostnames?.Value,
        };
      }) ?? []
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
        enableDnsSupport: val.$enableDnsSupport,
        enableDnsHostnames: val.$enableDnsHostnames,
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
