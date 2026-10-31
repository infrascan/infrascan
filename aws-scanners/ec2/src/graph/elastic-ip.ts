import {
  Address,
  DescribeAddressesCommandInput,
  DescribeAddressesCommandOutput,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface ElasticIpDetails {
  allocationId?: string;
  associationId?: string;
  domain?: string;
  networkInterfaceId?: string;
  networkInterfaceOwnerId?: string;
  instanceId?: string;
  privateIpAddress?: string;
  publicIpv4Pool?: string;
  networkBorderGroup?: string;
}

export interface ElasticIpState
  extends BaseState<DescribeAddressesCommandInput> {
  elasticIp?: ElasticIpDetails;
}

export const ElasticIpEntity: TranslatedEntity<
  ElasticIpState,
  State<DescribeAddressesCommandOutput, DescribeAddressesCommandInput>,
  WithCallContext<Address, DescribeAddressesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-elastic-ip",
  provider: "aws",
  command: "DescribeAddresses",
  category: "ec2",
  subcategory: "elastic-ip",
  nodeType: "ec2-elastic-ip",
  selector: "EC2|DescribeAddresses|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ElasticIpEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.Addresses?.map((address) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...address,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: ElasticIpEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    // EC2-Classic addresses have no allocation id, so fall back to the address itself
    $graph(val) {
      return {
        id: val.AllocationId ?? val.PublicIp!,
        label: val.PublicIp ?? val.AllocationId!,
        nodeClass: "informational",
        nodeType: ElasticIpEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: ElasticIpEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.AllocationId ?? val.PublicIp!,
        name: val.PublicIp ?? val.AllocationId!,
        category: ElasticIpEntity.category,
        subcategory: ElasticIpEntity.subcategory,
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
        command: ElasticIpEntity.command,
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
        publicIp:
          val.PublicIp != null
            ? { status: "enabled", address: val.PublicIp }
            : undefined,
        assignedAddresses:
          val.PrivateIpAddress != null
            ? { ipv4: val.PrivateIpAddress }
            : undefined,
      };
    },

    elasticIp(val) {
      return {
        allocationId: val.AllocationId,
        associationId: val.AssociationId,
        domain: val.Domain,
        networkInterfaceId: val.NetworkInterfaceId,
        networkInterfaceOwnerId: val.NetworkInterfaceOwnerId,
        instanceId: val.InstanceId,
        privateIpAddress: val.PrivateIpAddress,
        publicIpv4Pool: val.PublicIpv4Pool,
        networkBorderGroup: val.NetworkBorderGroup,
      };
    },
  },
};
