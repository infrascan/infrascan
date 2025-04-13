import jmespath from "jmespath";

import type {
  GenericParameterResolver,
  Connector,
  SelectedNode,
  AwsContext,
  SelectedEdge,
  SelectedEdgeTarget,
  TimeUnit,
  SizeUnit,
  TranslatedEntity,
  BaseState,
} from "@infrascan/shared-types";

export * from "./graph";
export * from "./errors";

export const Size = {
  Bytes: "B" as SizeUnit,
  Megabytes: "MB" as SizeUnit,
  Mebibytes: "MiB" as SizeUnit,
  Gigabytes: "GB" as SizeUnit,
  Gibibytes: "GiB" as SizeUnit,
} as const;

export const Time = {
  Seconds: "s" as TimeUnit,
  Milliseconds: "ms" as TimeUnit,
  Minutes: "m" as TimeUnit,
  Hours: "h" as TimeUnit,
  Days: "d" as TimeUnit,
} as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function evaluateSelector<T = unknown>(
  account: string,
  region: string,
  rawSelector: string,
  connector: Connector,
): Promise<T[]> {
  const [service, functionCall, ...selector] = rawSelector.split("|");

  const state = await connector.resolveStateForServiceFunction(
    account,
    region,
    service,
    functionCall,
  );
  return jmespath.search(state, selector.join("|"));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Resolves parameters for a service scanner from state using a connector and a state selector.
 * @param account
 * @param region
 * @param parameters
 * @param connector
 * @returns A list of parameter objects
 */
export async function resolveFunctionCallParameters(
  account: string,
  region: string,
  parameters: GenericParameterResolver[],
  connector: Connector,
): Promise<Record<string, any>[]> {
  const allParamObjects: Record<string, string>[] = [];
  for (const { Key, Selector, Value } of parameters) {
    if (Selector) {
      const parameterValues = await evaluateSelector<any>(
        account,
        region,
        Selector,
        connector,
      );
      for (let idx = 0; idx < parameterValues.length; idx += 1) {
        if (allParamObjects[idx] == null) {
          allParamObjects[idx] = {};
        }
        allParamObjects[idx][Key] = parameterValues[idx];
      }
    } else if (Value) {
      if (allParamObjects.length === 0) {
        allParamObjects.push({ [Key]: Value });
      } else {
        for (const parameterObject of allParamObjects) {
          parameterObject[Key] = Value;
        }
      }
    }
  }
  const validatedParamObjects = allParamObjects.filter((obj) => {
    const allParamsPresent = parameters.every(({ Key }) =>
      Object.keys(obj).includes(Key),
    );
    return allParamsPresent;
  });
  return validatedParamObjects;
}

export async function evaluateSelectorGlobally(
  rawSelector: string,
  connector: Connector,
) {
  const [service, functionCall, ...selector] = rawSelector.split("|");
  const aggregateState = await connector.getGlobalStateForServiceFunction(
    service,
    functionCall,
  );
  return jmespath.search(aggregateState, selector.join("|"));
}

export function formatEdge(
  source: string,
  target: SelectedEdgeTarget,
): SelectedEdge {
  return {
    source,
    target: target.target,
    metadata: {
      label: target.name,
    },
  };
}

function resolveParentForNode(
  context: AwsContext,
  isRegionBound: boolean,
): string {
  return isRegionBound
    ? `${context.account}-${context.region}`
    : context.account;
}

export function formatNode(
  selectedNode: SelectedNode,
  defaultType: string,
  context: AwsContext,
  isRegionBound: boolean,
): SelectedNode {
  return {
    id: selectedNode.id,
    name: selectedNode.name,
    parent: selectedNode.parent ?? resolveParentForNode(context, isRegionBound),
    type: selectedNode.type ?? defaultType,
    rawState: selectedNode.rawState,
  };
}

export function filterState(state: any, selector: string): any {
  return jmespath.search(state, selector);
}

export function formatS3NodeId(id: string): string {
  return `arn:aws:s3:::${id}`;
}

export function toLowerCase<T extends string>(val: T): Lowercase<T> {
  return val.toLowerCase() as Lowercase<T>;
}

export async function* generateNodesFromEntity<
  E extends TranslatedEntity<BaseState, any, any>,
>(connector: Connector, context: AwsContext, entity: E) {
  const retrievedState = await entity.getState(connector, context);
  const preparedState = retrievedState.flatMap((stateEntry) =>
    entity.translate(stateEntry),
  );
  const components = Object.entries(entity.components);
  for (const value of preparedState) {
    const node = Object.fromEntries(
      components.map(([label, factory]) => [label, factory(value)]),
    ) as unknown as BaseState;
    yield node;
  }
}
