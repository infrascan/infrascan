import jmespath from "jmespath";

import type {
  GenericParameterResolver,
  Connector,
  SelectedNode,
  AwsContext,
  SelectedEdge,
  SelectedEdgeTarget,
} from "@infrascan/shared-types";

export * from "./graph";
export * from "./errors";

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
