import {
  DescribeNetworkAclsCommandInput,
  DescribeNetworkAclsCommandOutput,
  NetworkAcl,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface NetworkAclEntry {
  ruleNumber?: number;
  /**
   * True for outbound rules, false for inbound
   */
  egress?: boolean;
  /**
   * `allow` or `deny`
   */
  ruleAction?: string;
  /**
   * Protocol number, `-1` for all protocols
   */
  protocol?: string;
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: { from?: number; to?: number };
  icmpTypeCode?: { type?: number; code?: number };
}

export interface NetworkAclDetails {
  ownerId?: string;
  isDefault?: boolean;
  /**
   * Every subnet is associated with exactly one network ACL, `subnet-…` ids
   */
  associations: { associationId?: string; subnetId?: string }[];
  entries: NetworkAclEntry[];
}

export interface NetworkAclState
  extends BaseState<DescribeNetworkAclsCommandInput> {
  networkAcl?: NetworkAclDetails;
}

export const NetworkAclEntity: TranslatedEntity<
  NetworkAclState,
  State<DescribeNetworkAclsCommandOutput, DescribeNetworkAclsCommandInput>,
  WithCallContext<NetworkAcl, DescribeNetworkAclsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-network-acl",
  provider: "aws",
  command: "DescribeNetworkAcls",
  category: "ec2",
  subcategory: "network-acl",
  nodeType: "ec2-network-acl",
  selector: "EC2|DescribeNetworkAcls|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      NetworkAclEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.NetworkAcls?.map((networkAcl) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...networkAcl,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: NetworkAclEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.NetworkAclId!,
        label: val.NetworkAclId!,
        nodeClass: "informational",
        nodeType: NetworkAclEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: NetworkAclEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.NetworkAclId!,
        name: val.NetworkAclId!,
        category: NetworkAclEntity.category,
        subcategory: NetworkAclEntity.subcategory,
      };
    },

    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: NetworkAclEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    network(val) {
      return {
        vpc: { id: val.VpcId },
      };
    },

    networkAcl(val) {
      return {
        ownerId: val.OwnerId,
        isDefault: val.IsDefault,
        associations:
          val.Associations?.map((assoc) => ({
            associationId: assoc.NetworkAclAssociationId,
            subnetId: assoc.SubnetId,
          })) ?? [],
        entries:
          val.Entries?.map((entry) => ({
            ruleNumber: entry.RuleNumber,
            egress: entry.Egress,
            ruleAction: entry.RuleAction,
            protocol: entry.Protocol,
            cidrBlock: entry.CidrBlock,
            ipv6CidrBlock: entry.Ipv6CidrBlock,
            portRange:
              entry.PortRange != null
                ? { from: entry.PortRange.From, to: entry.PortRange.To }
                : undefined,
            icmpTypeCode:
              entry.IcmpTypeCode != null
                ? {
                    type: entry.IcmpTypeCode.Type,
                    code: entry.IcmpTypeCode.Code,
                  }
                : undefined,
          })) ?? [],
      };
    },
  },
};
