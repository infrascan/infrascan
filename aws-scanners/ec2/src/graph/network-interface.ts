import {
  DescribeNetworkInterfacesCommandInput,
  DescribeNetworkInterfacesCommandOutput,
  NetworkInterface,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export const NetworkInterfaceEntity: TranslatedEntity<
  BaseState<unknown>,
  State<
    DescribeNetworkInterfacesCommandOutput,
    DescribeNetworkInterfacesCommandInput
  >,
  WithCallContext<NetworkInterface, DescribeNetworkInterfacesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-network-interface",
  provider: "aws",
  command: "DescribeNetworkInterfaces",
  category: "ec2",
  subcategory: "network-interface",
  nodeType: "ec2-network-interface",
  selector: "EC2|DescribeNetworkInterfaces|[]",

  translate(val) {
    return (
      val._result.NetworkInterfaces?.map((networkInterface) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...networkInterface,
      })) ?? []
    );
  },

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      NetworkInterfaceEntity.selector,
      state,
    );
  },

  components: {
    $metadata(val) {
      return {
        version: NetworkInterfaceEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.NetworkInterfaceId!,
        label: val.PrivateDnsName ?? val.NetworkInterfaceId!,
        nodeClass: "informational",
        nodeType: NetworkInterfaceEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: NetworkInterfaceEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.NetworkInterfaceId!,
        name: val.PrivateDnsName ?? val.NetworkInterfaceId!,
        category: NetworkInterfaceEntity.category,
        subcategory: NetworkInterfaceEntity.subcategory,
        description: val.Description?.length ? val.Description : undefined,
      };
    },

    tags(val) {
      return (
        val.TagSet?.map((tag) => ({
          key: tag.Key!,
          val: tag.Value!,
        })) ?? []
      );
    },

    $source(val) {
      return {
        command: NetworkInterfaceEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZone != null ? [val.AvailabilityZone] : undefined,
      };
    },

    network(val) {
      return {
        targetSubnets: val.SubnetId != null ? [val.SubnetId] : undefined,
        assignedAddresses: {
          ipv4: val.PrivateIpAddress,
        },
        publicIp:
          val.Association?.PublicIp != null
            ? {
                status: "enabled",
                address: val.Association?.PublicIp,
              }
            : undefined,
        vpc: {
          id: val.VpcId,
        },
        securityGroups: val.Groups?.map((group) => group.GroupId!),
      };
    },
    dns(val) {
      const domains = [];
      if (val.PrivateDnsName) {
        domains.push(val.PrivateDnsName);
      }
      if (val.Association?.PublicDnsName) {
        domains.push(val.Association?.PublicDnsName);
      }
      return {
        domains,
      };
    },
  },
};
