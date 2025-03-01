export type State<O, I = unknown> = {
  _metadata: {
    account: string;
    region: string;
    timestamp: string;
  };
  _result: O;
  _parameters?: I;
};

export type GenericState = State<unknown>;

/**
 * Metadata for any piece of state generated — when it was scanned, and what version of the state schema it uses
 */
export interface StateMetadata {
  version: string;
  timestamp: string;
}

/**
 * Coordinates of a node in the graph including an optional position on the Z axis
 */
export interface Coordinates {
  x: number;
  y: number;
  z?: number;
}

/**
 * Details about the nodes position in the graph and how it relates to other components
 */
export interface GraphInfo {
  /**
   * The unique ID of the node in the graph
   */
  id: string;
  /**
   * The human readable name of the node in the graph
   */
  label: string;
  /**
   * The type of the node, used for assigning an icon in the graph
   */
  nodeType: string;
  /**
   * The ID of the parent node, optional.
   */
  parent?: string;
  /**
   * The coordinates of the node in the graph, optional.
   */
  coords?: Coordinates;
}

/**
 * The tenant that the resource has been created in, typically an account or org. Should be defined for every resource.
 */
export interface Tenant {
  /**
   * CSP that the state refers to (aws, gcp, azure)
   */
  provider: string;
  /**
   * The partition of this state e.g. govcloud, cn partitions
   */
  partition?: string;
  /**
   * The unique ID for the tenant (e.g. account id)
   */
  tenantId: string;
}

/**
 * The geo data for a resource tracking where it is deployed to and, if known, which specific zones (i.e. datacenters) its in.
 */
export interface Location {
  /**
   * The standard reference name for the region e.g. us-east-1
   */
  code: string;
  /**
   * The availability zone/datacenter that the resource is in e.g. us-east-1a
   */
  zone?: string;
}

/**
 * Details which identify a resource within the state
 */
export interface Resource {
  /**
   * Category tracks whether this resource is a higher level concept like an account, or a service of a resource
   */
  category: string;
  /**
   * Subcategory tracks the resource's more specific resource type e.g. sub-service entity type. Not set for higher level concepts
   */
  subcategory?: string;
  /**
   * The unique ID of the resource — either an account number or a resource ID
   */
  id: string;
  /**
   * The human-readable name of the resource
   */
  name: string;
  /**
   * The resource level policy which dictates access
   */
  policy?: Record<string, unknown>;
}

export interface Role {
  arn: string;
  label: string;
}

/**
 * The IAM roles associated with a resource. Supports resources with many roles assigned to varying lifecycles
 */
export interface IAM {
  roles: Role[];
}

/**
 * The audit details of any existing resource where available - tracks who created the resource and when.
 */
export interface Audit {
  createdAt?: string | Date;
  createdBy?: string;
}

/**
 * The domain names that a resource can be accessed at
 */
export interface DNS {
  /**
   * List of domain names at which a resource is accessible
   */
  domains: string[];
}

/**
 * The network information for a scanned resource which aims to cover both resources being assigned an address
 * and the networking resource itself (VPC, subnet)
 */
export interface Network {
  /**
   * Information about the public IP of the resource
   */
  publicIp?: {
    status?: "enabled" | "disabled";
    address?: string;
  };
  /**
   * List of security group IDs that are associated with the resource
   */
  securityGroups?: string[];
  /**
   * The subnets that the resource is deployed into
   */
  targetSubnets?: string[];
  /**
   * The IPs that have been assigned to the resource within the private network.
   */
  assignedAddresses?: {
    ipv4?: string;
    ipv6?: string;
  };
  /**
   * The IP ranges reserved for a networking resource (VPC, subnet)
   */
  reservedAddresses?: [
    {
      family: "ipv4" | "ipv6";
      cidrBlock: string;
      cidrBlockAssociationSets?: [
        {
          associationId: string;
          cidrBlock: string;
          state: string;
          stateMessage: string;
        },
      ];
      firstAddress: string;
      lastAddress: string;
    },
  ];
  /**
   * The information relating to a specific subnet
   */
  subnet?: {
    ipv6Only?: boolean;
    availableAddressCount?: number;
  };
  /**
   * The information relating to a specific VPC.
   */
  vpc?: {
    dhcpOptionsId?: string;
    state?: string;
    instanceTenancy?: string;
    default?: boolean;
  };
}

/**
 * Generic structure for tracking key value datatypes
 */
export interface KVPair {
  key?: string;
  value?: string;
}

/**
 * Structure for tracking the source of state that was scanned
 */
export interface Source<T> {
  command: string;
  parameters?: T;
}

/**
 * Structure for representing the relationship between resources and the load balancers that route to them
 */
export interface LoadBalancer {
  name?: string;
  port?: number;
  targetGroupArn?: string;
}

export enum Unit {
  Second = "s",
  Millisecond = "ms",
  Minute = "m",
  Hour = "h",
  Day = "d",
}

export interface HealthcheckConfig {
  status?: string;
  gracePeriod?: {
    value?: number;
    unit?: Unit;
  };
}

/**
 * Base state type to be extended on a per-service basis with the service specific context to use for linking.
 * Attribute specific information can be found on each type.
 */
export interface BaseState<T = unknown> {
  $metadata: StateMetadata;
  $graph: GraphInfo;
  $source?: Source<T>;
  tenant: Tenant;
  location?: Location;
  loadBalancers?: LoadBalancer[];
  resource: Resource;
  dns?: DNS;
  iam?: IAM;
  healthcheck?: HealthcheckConfig;
  network?: Network;
  audit?: Audit;
  tags?: KVPair[];
}
