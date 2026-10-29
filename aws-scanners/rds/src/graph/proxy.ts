import type {
  DBProxy,
  DBProxyTarget,
  DescribeDBProxiesCommandInput,
  DescribeDBProxiesCommandOutput,
  DescribeDBProxyTargetsCommandInput,
  DescribeDBProxyTargetsCommandOutput,
} from "@aws-sdk/client-rds";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import type { RDSState } from "./instance";

export interface ProxyAuth {
  description?: string;
  userName?: string;
  authScheme?: string;
  /**
   * Secrets Manager secret used by the proxy to connect to its targets
   */
  secretArn?: string;
  iamAuth?: string;
  clientPasswordAuthType?: string;
}

export interface ProxyTarget {
  type?: string;
  role?: string;
  /**
   * Instance identifier for RDS_INSTANCE targets, cluster identifier for TRACKED_CLUSTER targets
   */
  rdsResourceId?: string;
  trackedClusterId?: string;
  targetArn?: string;
  endpoint?: string;
  port?: number;
  health?: {
    state?: string;
    reason?: string;
    description?: string;
  };
}

export interface ProxyDetails {
  name?: string;
  status?: string;
  engineFamily?: string;
  endpoint?: string;
  requireTLS?: boolean;
  defaultAuthScheme?: string;
  auth: ProxyAuth[];
  idleClientTimeout?: number;
  debugLogging?: boolean;
  endpointNetworkType?: string;
  targetConnectionNetworkType?: string;
  targets: ProxyTarget[];
}

export type RDSProxyState = BaseState<DescribeDBProxiesCommandInput> & {
  rds: RDSState & { proxy: ProxyDetails };
};

type ProxyPage = Serialized<
  State<DescribeDBProxiesCommandOutput, DescribeDBProxiesCommandInput>
>;
type ProxyTargetsPage = Serialized<
  State<DescribeDBProxyTargetsCommandOutput, DescribeDBProxyTargetsCommandInput>
>;

type ProxyPageWithTargets = State<
  DescribeDBProxiesCommandOutput,
  DescribeDBProxiesCommandInput
> & {
  _targets: Record<string, DBProxyTarget[]>;
};

type ProxyWithContext = WithCallContext<
  DBProxy,
  DescribeDBProxiesCommandInput
> & {
  Targets: DBProxyTarget[];
};

export const RDSProxyEntity: TranslatedEntity<
  RDSProxyState,
  ProxyPageWithTargets,
  ProxyWithContext
> = {
  version: "0.1.0",
  debugLabel: "rds-proxy",
  provider: "aws",
  command: "DescribeDBProxies",
  category: "rds",
  subcategory: "proxy",
  nodeType: "rds-proxy",
  selector: "RDS|DescribeDBProxies|[]",

  async getState(state, context) {
    const proxyPages = await evaluateSelector<ProxyPage>(
      context.account,
      context.region,
      RDSProxyEntity.selector,
      state,
    );
    const targetPages = await evaluateSelector<ProxyTargetsPage>(
      context.account,
      context.region,
      "RDS|DescribeDBProxyTargets|[]",
      state,
    );
    // Targets are paginated per proxy, so a single proxy can have several pages
    const targetsByProxy: Record<string, Serialized<DBProxyTarget>[]> = {};
    for (const page of targetPages) {
      const proxyName = page._parameters?.DBProxyName;
      if (proxyName != null) {
        targetsByProxy[proxyName] = (targetsByProxy[proxyName] ?? []).concat(
          page._result.Targets ?? [],
        );
      }
    }
    return proxyPages.map((page) => ({ ...page, _targets: targetsByProxy }));
  },

  translate(val) {
    return (val._result.DBProxies ?? [])
      .filter((proxy) => proxy.DBProxyArn != null)
      .map((proxy) => ({
        ...proxy,
        Targets:
          proxy.DBProxyName != null
            ? val._targets[proxy.DBProxyName] ?? []
            : [],
        $metadata: val._metadata,
        $parameters: val._parameters,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: RDSProxyEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.DBProxyArn!,
        label: val.DBProxyName ?? val.DBProxyArn!,
        nodeType: RDSProxyEntity.nodeType,
        nodeClass: "visual",
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: RDSProxyEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: RDSProxyEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.DBProxyArn!,
        name: val.DBProxyName ?? val.DBProxyArn!,
        category: RDSProxyEntity.category,
        subcategory: RDSProxyEntity.subcategory,
        description: val.EngineFamily,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreatedDate),
      };
    },

    iam(val) {
      const roles = [];
      if (val.RoleArn != null) {
        roles.push({
          label: "proxy-role",
          arn: val.RoleArn,
        });
      }
      return { roles };
    },

    network(val) {
      return {
        vpc: {
          id: val.VpcId,
        },
        securityGroups: val.VpcSecurityGroupIds ?? [],
        targetSubnets: val.VpcSubnetIds ?? [],
      };
    },

    dns(val) {
      return {
        domains: val.Endpoint != null ? [val.Endpoint] : [],
      };
    },

    rds(val) {
      return {
        engine: {
          type: val.EngineFamily,
        },
        proxy: {
          name: val.DBProxyName,
          status: val.Status,
          engineFamily: val.EngineFamily,
          endpoint: val.Endpoint,
          requireTLS: val.RequireTLS,
          defaultAuthScheme: val.DefaultAuthScheme,
          auth: (val.Auth ?? []).map((auth) => ({
            description: auth.Description,
            userName: auth.UserName,
            authScheme: auth.AuthScheme,
            secretArn: auth.SecretArn,
            iamAuth: auth.IAMAuth,
            clientPasswordAuthType: auth.ClientPasswordAuthType,
          })),
          idleClientTimeout: val.IdleClientTimeout,
          debugLogging: val.DebugLogging,
          endpointNetworkType: val.EndpointNetworkType,
          targetConnectionNetworkType: val.TargetConnectionNetworkType,
          targets: val.Targets.map((target) => ({
            type: target.Type,
            role: target.Role,
            rdsResourceId: target.RdsResourceId,
            trackedClusterId: target.TrackedClusterId,
            targetArn: target.TargetArn,
            endpoint: target.Endpoint,
            port: target.Port,
            health:
              target.TargetHealth != null
                ? {
                    state: target.TargetHealth.State,
                    reason: target.TargetHealth.Reason,
                    description: target.TargetHealth.Description,
                  }
                : undefined,
          })),
        },
      };
    },
  },
};
