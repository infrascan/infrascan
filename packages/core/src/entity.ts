import type {
  Audit,
  AwsContext,
  DNS,
  GraphInfo,
  HealthcheckConfig,
  IAM,
  KVPair,
  LoadBalancer,
  Location,
  Network,
  Resource,
  Source,
  State,
  StateMetadata,
  Tenant,
} from "@infrascan/shared-types";

export interface GraphableEntity<T> {
  nodeType: string;
  category: string;
  command?: string;
  subcategory?: string;

  $graph(entity: T): GraphInfo;
  resource(entity: T): Resource;
}

export interface CommonEntity {
  tenant(context: AwsContext): Tenant;
  location(context: AwsContext): Location;
  $metadata(metadata: State<unknown>["_metadata"]): StateMetadata;
}

export interface SourcedEntity<T, P> {
  $source(entity: T): Source<P>;
}

export interface TaggedEntity<T> {
  tags(entity: T): KVPair[] | undefined;
}

export interface LoadBalancedEntity<T> {
  loadBalancers(entity: T): LoadBalancer[] | undefined;
}

export interface NetworkedEntity<T> {
  network(entity: T): Network | undefined;
}

export interface DNSEntity<T> {
  dns(entity: T): DNS | undefined;
}

export interface IAMEntity<T> {
  iam(entity: T): IAM | undefined;
}

export interface HealthcheckEntity<T> {
  healthcheck(entity: T): HealthcheckConfig | undefined;
}

export interface AuditableEntity<T> {
  audit(entity: T): Audit | undefined;
}

export class BaseEntity implements CommonEntity {
  static version = "0.1.0";

  tenant(context: AwsContext): Tenant {
    return {
      tenantId: context.account,
      provider: "aws",
      partition: context.partition,
    };
  }

  location(context: AwsContext): Location {
    return {
      code: context.region,
    };
  }

  $metadata(metadata: State<unknown>["_metadata"]): StateMetadata {
    return {
      timestamp: metadata.timestamp,
      version: BaseEntity.version,
    };
  }
}
