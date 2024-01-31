import jmespath from "jmespath";

export * from './graph';

import type {
  GenericParameterResolver,
  Connector,
  EdgeTarget,
  GraphEdge,
  GraphNode,
  SelectedNode,
  AwsContext,
} from "@infrascan/shared-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function evaluateSelector(
  account: string,
  region: string,
  rawSelector: string,
  connector: Connector,
): Promise<any[]> {
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
      const parameterValues = await evaluateSelector(
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

export function formatEdge(source: string, target: EdgeTarget): GraphEdge {
  const edgeId = `${source}:${target.target}`;
  return {
    group: "edges",
    data: {
      id: edgeId,
      name: target.name,
      source,
      target: target.target,
      type: "edge",
    },
    metadata: {
      label: target.name,
    },
  };
}

function resolveParentForNode(
  context: AwsContext,
  isRegionBound: boolean,
): string {
  return isRegionBound ? `${context.account}-${context.region}` : context.account;
}

export function formatNode(
  selectedNode: SelectedNode,
  service: string,
  defaultType: string,
  context: AwsContext,
  isRegionBound: boolean
): GraphNode {
  return {
    group: "nodes",
    id: selectedNode.id,
    data: {
      id: selectedNode.id,
      name: selectedNode.name,
      parent: selectedNode.parent ?? resolveParentForNode(context, isRegionBound),
      service,
      type: selectedNode.type ?? defaultType,
    },
    metadata: selectedNode.rawState,
  };
}

export function filterState(state: any, selector: string): any {
  return jmespath.search(state, selector);
}

export function formatS3NodeId(id: string): string {
  return `arn:aws:s3:::${id}`;
}
