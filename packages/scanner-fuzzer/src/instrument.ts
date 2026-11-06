/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  BaseState,
  EntityRoleData,
  SelectedEdge,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { FindingCollector } from "./findings";
import type { AwsScanner } from "./scanners";

type Entity = TranslatedEntity<BaseState, any, any>;

export interface InstrumentOptions {
  /**
   * When true (the default), a failure is recorded and then contained, so one
   * failing resource or getter doesn't hide failures elsewhere. When false, the
   * failure is recorded and rethrown, reproducing what a real run does with it.
   */
  isolate?: boolean;
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Describe a value by its kind rather than its content, so warnings about the
 * same problem group together.
 */
function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === "") {
    return "empty string";
  }
  if (typeof value === "string") {
    return "string";
  }
  return typeof value;
}

function instrumentEntity(
  entity: Entity,
  crash: (stage: string, error: unknown) => void,
  warn: (stage: string, message: string) => void,
): Entity {
  const label = entity.debugLabel ?? entity.nodeType;
  const componentEntries = Object.entries(entity.components) as [
    string,
    (value: any) => unknown,
  ][];

  return {
    ...entity,
    async getState(connector, context) {
      try {
        return await entity.getState(connector, context);
      } catch (err: unknown) {
        crash(`entity:${label}.getState`, err);
        return [];
      }
    },

    translate(state) {
      let values: any[];
      try {
        values = entity.translate(state);
      } catch (err: unknown) {
        crash(`entity:${label}.translate`, err);
        return [];
      }
      // Evaluate every component on its own, so each failure is recorded rather
      // than only the first. A value with any failing component is dropped.
      return values.filter((value) => {
        let ok = true;
        let graph: { id?: unknown } | undefined;
        for (const [component, factory] of componentEntries) {
          try {
            const output = factory(value);
            if (component === "$graph") {
              graph = output as { id?: unknown };
            }
          } catch (err: unknown) {
            ok = false;
            crash(`entity:${label}.${component}`, err);
          }
        }
        if (ok && !isNonEmptyString(graph?.id)) {
          warn(
            `entity:${label}.$graph`,
            `${entity.nodeType} node has id ${describe(graph?.id)}`,
          );
        }
        return ok;
      });
    },
  };
}

/**
 * Wrap every extension point of a scanner (getters, IAM role and edge
 * resolution, entity translation and components) so failures are recorded
 * against the stage they happened in, and outputs are validated.
 */
export function instrumentScanner(
  scanner: AwsScanner,
  findings: FindingCollector,
  { isolate = true }: InstrumentOptions = {},
): AwsScanner {
  const scannerKey = scanner.key;
  const crash = (stage: string, error: unknown) => {
    findings.record({ severity: "crash", stage, scanner: scannerKey, error });
    if (!isolate) {
      throw error;
    }
  };
  const warn = (stage: string, message: string) =>
    findings.record({
      severity: "warning",
      stage,
      scanner: scannerKey,
      error: new InvalidOutputError(message),
    });

  const getters = scanner.getters.map((getter) => {
    const stage = `getter:${getter.name || "anonymous"}`;
    const instrumented: typeof getter = async (client, connector, context) => {
      try {
        await getter(client, connector, context);
      } catch (err: unknown) {
        crash(stage, err);
      }
    };
    Object.defineProperty(instrumented, "name", { value: getter.name });
    return instrumented;
  });

  const { getIamRoles, getEdges } = scanner;
  const instrumentedGetIamRoles =
    getIamRoles != null
      ? async (connector: Parameters<typeof getIamRoles>[0]) => {
          let roles: EntityRoleData[] = [];
          try {
            roles = await getIamRoles(connector);
          } catch (err: unknown) {
            crash("getIamRoles", err);
            return [];
          }
          for (const role of roles) {
            if (!isNonEmptyString(role?.roleArn)) {
              warn(
                "getIamRoles",
                `returned a role with roleArn ${describe(role?.roleArn)}`,
              );
            }
          }
          return roles;
        }
      : undefined;

  const instrumentedGetEdges =
    getEdges != null
      ? async (connector: Parameters<typeof getEdges>[0]) => {
          let edges: SelectedEdge[] = [];
          try {
            edges = await getEdges(connector);
          } catch (err: unknown) {
            crash("getEdges", err);
            return [];
          }
          for (const edge of edges) {
            if (
              !isNonEmptyString(edge?.source) ||
              !isNonEmptyString(edge?.target)
            ) {
              warn(
                "getEdges",
                `returned an edge from ${describe(edge?.source)} to ${describe(
                  edge?.target,
                )}`,
              );
            }
          }
          return edges;
        }
      : undefined;

  return {
    ...scanner,
    getters,
    getIamRoles: instrumentedGetIamRoles,
    getEdges: instrumentedGetEdges,
    entities: scanner.entities?.map((entity) =>
      instrumentEntity(entity, crash, warn),
    ),
  };
}
