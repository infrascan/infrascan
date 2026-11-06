import type {
  Authorizer,
  GetAuthorizersCommandInput,
  GetAuthorizersCommandOutput,
  GetIntegrationsCommandInput,
  GetIntegrationsCommandOutput,
  GetRoutesCommandInput,
  GetRoutesCommandOutput,
  Integration,
  Route,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelectorGlobally, formatEdge } from "@infrascan/core";
import type {
  CommandCallMetadata,
  Connector,
  EntityRoleData,
  SelectedEdge,
  Serialized,
  State,
} from "@infrascan/shared-types";
import debug from "debug";
import {
  formatApiArn,
  getIntegrationIdFromRouteTarget,
  resolveAuthorizerTarget,
  resolveIntegrationTarget,
} from "./targets";

const edgesDebug = debug("apigatewayv2:edges");

type PerApiState<O, I extends { ApiId: string | undefined }> = Serialized<
  State<O, I>
>;

/**
 * A route, along with the integration and authorizer it uses, which have been
 * joined from the per-API state.
 */
interface ResolvedRoute {
  apiArn: string;
  location: CommandCallMetadata;
  route: Serialized<Route>;
  integration?: Serialized<Integration>;
  authorizer?: Serialized<Authorizer>;
}

function apiKey(metadata: CommandCallMetadata, apiId: string): string {
  return `${metadata.account}|${metadata.region}|${apiId}`;
}

/**
 * Indexes per-API state by account, region, API and resource ID so routes can be
 * joined onto the integrations and authorizers they reference.
 */
function indexByApi<T, I extends { ApiId: string | undefined }>(
  pages: PerApiState<{ Items?: T[] }, I>[],
  getId: (item: Serialized<T>) => string | undefined,
): Map<string, Serialized<T>> {
  const index = new Map<string, Serialized<T>>();
  for (const page of pages) {
    const apiId = page._parameters?.ApiId;
    if (apiId != null) {
      for (const item of page._result.Items ?? []) {
        const id = getId(item);
        if (id != null) {
          index.set(`${apiKey(page._metadata, apiId)}|${id}`, item);
        }
      }
    }
  }
  return index;
}

/**
 * Routes are what make an integration or authorizer reachable, so they are used
 * as the basis for API Gateway's edges: an integration or authorizer that no
 * route references doesn't produce an edge.
 */
export async function resolveRoutes(
  stateConnector: Connector,
): Promise<ResolvedRoute[]> {
  const [routesState, integrationsState, authorizersState]: [
    PerApiState<GetRoutesCommandOutput, GetRoutesCommandInput>[],
    PerApiState<GetIntegrationsCommandOutput, GetIntegrationsCommandInput>[],
    PerApiState<GetAuthorizersCommandOutput, GetAuthorizersCommandInput>[],
  ] = await Promise.all([
    evaluateSelectorGlobally("ApiGatewayV2|GetRoutes|[]", stateConnector),
    evaluateSelectorGlobally("ApiGatewayV2|GetIntegrations|[]", stateConnector),
    evaluateSelectorGlobally("ApiGatewayV2|GetAuthorizers|[]", stateConnector),
  ]);

  const integrations = indexByApi(
    integrationsState ?? [],
    (integration) => integration.IntegrationId,
  );
  const authorizers = indexByApi(
    authorizersState ?? [],
    (authorizer) => authorizer.AuthorizerId,
  );

  return (routesState ?? []).flatMap((page) => {
    const apiId = page._parameters?.ApiId;
    if (apiId == null) {
      return [];
    }
    const key = apiKey(page._metadata, apiId);
    const apiArn = formatApiArn(
      page._metadata.region,
      apiId,
      page._metadata.partition,
    );
    return (page._result.Items ?? []).map((route) => {
      const integrationId = getIntegrationIdFromRouteTarget(route.Target);
      return {
        apiArn,
        location: page._metadata,
        route,
        integration:
          integrationId != null
            ? integrations.get(`${key}|${integrationId}`)
            : undefined,
        authorizer:
          route.AuthorizerId != null
            ? authorizers.get(`${key}|${route.AuthorizerId}`)
            : undefined,
      };
    });
  });
}

/**
 * Builds edges from each API to the resources its routes send requests to,
 * via the route's integration, and to the lambda functions which authorize them.
 * Edges between the same API and target are merged, and labelled with every
 * route that uses them.
 */
export async function getRouteEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Resolving route edges");
  const labelsByEdge = new Map<string, Map<string, Set<string>>>();
  const addLabel = (apiArn: string, target: string, label: string) => {
    const targets = labelsByEdge.get(apiArn) ?? new Map<string, Set<string>>();
    const labels = targets.get(target) ?? new Set<string>();
    labels.add(label);
    targets.set(target, labels);
    labelsByEdge.set(apiArn, targets);
  };

  const routes = await resolveRoutes(stateConnector);
  for (const { apiArn, location, route, integration, authorizer } of routes) {
    const routeKey = route.RouteKey ?? route.RouteId ?? "route";
    const integrationTarget =
      integration != null
        ? resolveIntegrationTarget(integration, location)
        : undefined;
    if (integrationTarget != null) {
      addLabel(apiArn, integrationTarget, routeKey);
    }
    const authorizerTarget =
      authorizer != null ? resolveAuthorizerTarget(authorizer) : undefined;
    if (authorizerTarget != null) {
      addLabel(
        apiArn,
        authorizerTarget,
        `Authorizer: ${authorizer?.Name ?? authorizer?.AuthorizerId}`,
      );
    }
  }

  const edges = [...labelsByEdge.entries()].flatMap(([apiArn, targets]) =>
    [...targets.entries()].map(([target, labels]) =>
      formatEdge(apiArn, { target, name: [...labels].sort().join(", ") }),
    ),
  );
  edgesDebug(`Found ${edges.length} route edges`);
  return edges;
}

/**
 * Integrations and authorizers can assume a role to invoke their target, which
 * is attributed to the API. As with edges, only those used by a route are included.
 */
export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  const roles = new Map<string, EntityRoleData>();
  const addRole = (roleArn: string | undefined, executor: string) => {
    if (roleArn != null) {
      roles.set(`${roleArn}|${executor}`, { roleArn, executor });
    }
  };

  const routes = await resolveRoutes(stateConnector);
  for (const { apiArn, integration, authorizer } of routes) {
    addRole(integration?.CredentialsArn, apiArn);
    addRole(authorizer?.AuthorizerCredentialsArn, apiArn);
  }
  return [...roles.values()];
}
