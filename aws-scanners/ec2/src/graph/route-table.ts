import {
  DescribeRouteTablesCommandInput,
  DescribeRouteTablesCommandOutput,
  RouteTable,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface RouteTableRoute {
  destinationCidrBlock?: string;
  destinationIpv6CidrBlock?: string;
  destinationPrefixListId?: string;
  /**
   * `local`, or the id of an internet, virtual private or gateway endpoint (`igw-…`, `vgw-…`, `vpce-…`)
   */
  gatewayId?: string;
  natGatewayId?: string;
  transitGatewayId?: string;
  vpcPeeringConnectionId?: string;
  egressOnlyInternetGatewayId?: string;
  networkInterfaceId?: string;
  instanceId?: string;
  instanceOwnerId?: string;
  localGatewayId?: string;
  carrierGatewayId?: string;
  coreNetworkArn?: string;
  /**
   * `active`, or `blackhole` when the target no longer exists
   */
  state?: string;
  /**
   * CreateRouteTable, CreateRoute or EnableVgwRoutePropagation
   */
  origin?: string;
}

export interface RouteTableAssociation {
  associationId?: string;
  /**
   * True for the VPC's main route table, used by every subnet without an explicit association
   */
  main?: boolean;
  /**
   * A `subnet-…` id, subnet nodes are keyed by their ARN and labelled with this id
   */
  subnetId?: string;
  /**
   * Gateway associated with the table for ingress routing
   */
  gatewayId?: string;
  state?: string;
}

export interface RouteTableDetails {
  ownerId?: string;
  main: boolean;
  associations: RouteTableAssociation[];
  propagatingVgwIds: string[];
  routes: RouteTableRoute[];
}

export interface RouteTableState
  extends BaseState<DescribeRouteTablesCommandInput> {
  routeTable?: RouteTableDetails;
}

export const RouteTableEntity: TranslatedEntity<
  RouteTableState,
  State<DescribeRouteTablesCommandOutput, DescribeRouteTablesCommandInput>,
  WithCallContext<RouteTable, DescribeRouteTablesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-route-table",
  provider: "aws",
  command: "DescribeRouteTables",
  category: "ec2",
  subcategory: "route-table",
  nodeType: "ec2-route-table",
  selector: "EC2|DescribeRouteTables|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      RouteTableEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.RouteTables?.map((routeTable) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...routeTable,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: RouteTableEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.RouteTableId!,
        label: val.RouteTableId!,
        nodeClass: "informational",
        nodeType: RouteTableEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: RouteTableEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.RouteTableId!,
        name: val.RouteTableId!,
        category: RouteTableEntity.category,
        subcategory: RouteTableEntity.subcategory,
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
        command: RouteTableEntity.command,
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

    routeTable(val) {
      return {
        ownerId: val.OwnerId,
        main: val.Associations?.some((assoc) => assoc.Main === true) ?? false,
        associations:
          val.Associations?.map((assoc) => ({
            associationId: assoc.RouteTableAssociationId,
            main: assoc.Main,
            subnetId: assoc.SubnetId,
            gatewayId: assoc.GatewayId,
            state: assoc.AssociationState?.State,
          })) ?? [],
        propagatingVgwIds:
          val.PropagatingVgws?.map((vgw) => vgw.GatewayId).filter(
            (id): id is string => id != null,
          ) ?? [],
        routes:
          val.Routes?.map((route) => ({
            destinationCidrBlock: route.DestinationCidrBlock,
            destinationIpv6CidrBlock: route.DestinationIpv6CidrBlock,
            destinationPrefixListId: route.DestinationPrefixListId,
            gatewayId: route.GatewayId,
            natGatewayId: route.NatGatewayId,
            transitGatewayId: route.TransitGatewayId,
            vpcPeeringConnectionId: route.VpcPeeringConnectionId,
            egressOnlyInternetGatewayId: route.EgressOnlyInternetGatewayId,
            networkInterfaceId: route.NetworkInterfaceId,
            instanceId: route.InstanceId,
            instanceOwnerId: route.InstanceOwnerId,
            localGatewayId: route.LocalGatewayId,
            carrierGatewayId: route.CarrierGatewayId,
            coreNetworkArn: route.CoreNetworkArn,
            state: route.State,
            origin: route.Origin,
          })) ?? [],
      };
    },
  },
};
