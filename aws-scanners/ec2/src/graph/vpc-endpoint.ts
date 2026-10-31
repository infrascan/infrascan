import {
  DescribeVpcEndpointsCommandInput,
  DescribeVpcEndpointsCommandOutput,
  VpcEndpoint,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface VpcEndpointDetails {
  /**
   * `Gateway`, `Interface`, `GatewayLoadBalancer`, `Resource` or `ServiceNetwork`
   */
  endpointType?: string;
  serviceName?: string;
  state?: string;
  ownerId?: string;
  requesterManaged?: boolean;
  /**
   * Route tables a gateway endpoint adds its prefix list route to
   */
  routeTableIds: string[];
  /**
   * `subnet-…` ids an interface or gateway load balancer endpoint has interfaces in
   */
  subnetIds: string[];
  networkInterfaceIds: string[];
  privateDnsEnabled?: boolean;
  ipAddressType?: string;
  dnsEntries: { dnsName?: string; hostedZoneId?: string }[];
}

export interface VpcEndpointState
  extends BaseState<DescribeVpcEndpointsCommandInput> {
  vpcEndpoint?: VpcEndpointDetails;
}

export const VpcEndpointEntity: TranslatedEntity<
  VpcEndpointState,
  State<DescribeVpcEndpointsCommandOutput, DescribeVpcEndpointsCommandInput>,
  WithCallContext<VpcEndpoint, DescribeVpcEndpointsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-vpc-endpoint",
  provider: "aws",
  command: "DescribeVpcEndpoints",
  category: "ec2",
  subcategory: "vpc-endpoint",
  nodeType: "ec2-vpc-endpoint",
  selector: "EC2|DescribeVpcEndpoints|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      VpcEndpointEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.VpcEndpoints?.map((endpoint) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...endpoint,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: VpcEndpointEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.VpcEndpointId!,
        label: val.VpcEndpointId!,
        nodeClass: "informational",
        nodeType: VpcEndpointEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: VpcEndpointEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.VpcEndpointId!,
        name: val.VpcEndpointId!,
        category: VpcEndpointEntity.category,
        subcategory: VpcEndpointEntity.subcategory,
        policy: val.PolicyDocument,
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
        command: VpcEndpointEntity.command,
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
        targetSubnets: val.SubnetIds,
        securityGroups: val.Groups?.map((group) => group.GroupId).filter(
          (id): id is string => id != null,
        ),
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTimestamp),
      };
    },

    vpcEndpoint(val) {
      return {
        endpointType: val.VpcEndpointType,
        serviceName: val.ServiceName,
        state: val.State,
        ownerId: val.OwnerId,
        requesterManaged: val.RequesterManaged,
        routeTableIds: val.RouteTableIds ?? [],
        subnetIds: val.SubnetIds ?? [],
        networkInterfaceIds: val.NetworkInterfaceIds ?? [],
        privateDnsEnabled: val.PrivateDnsEnabled,
        ipAddressType: val.IpAddressType,
        dnsEntries:
          val.DnsEntries?.map((entry) => ({
            dnsName: entry.DnsName,
            hostedZoneId: entry.HostedZoneId,
          })) ?? [],
      };
    },
  },
};
