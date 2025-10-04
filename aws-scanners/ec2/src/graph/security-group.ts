import {
  DescribeSecurityGroupsCommandInput,
  DescribeSecurityGroupsCommandOutput,
  SecurityGroup,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  Connector,
  IpRange,
  NetworkRule,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

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
