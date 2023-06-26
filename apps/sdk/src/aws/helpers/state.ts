import jmespath from "jmespath";
import type { ResolveStateFromServiceFn } from "@shared-types/api";

export type ParameterResolver = {
  Key: string;
  Selector?: string;
  Value?: any;
};

export async function resolveFunctionCallParameters(
  account: string,
  region: string,
  parameters: ParameterResolver[],
  resolveStateForServiceCall: ResolveStateFromServiceFn
): Promise<Record<string, any>[]> {
  const allParamObjects: Record<string, string>[] = [];
  for (const { Key, Selector, Value } of parameters) {
    if (Selector) {
      const parameterValues = await evaluateSelector(
        account,
        region,
        Selector,
        resolveStateForServiceCall
      );
      for (let idx = 0; idx < parameterValues.length; idx++) {
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
      Object.keys(obj).includes(Key)
    );
    return allParamsPresent;
  });
  return validatedParamObjects;
}

async function evaluateSelector(
  account: string,
  region: string,
  rawSelector: string,
  resolveStateForServiceCall: ResolveStateFromServiceFn
): Promise<any[]> {
  const [service, functionCall, ...selector] = rawSelector.split("|");
  const state = await resolveStateForServiceCall(
    account,
    region,
    service,
    functionCall
  );
  return jmespath.search(state, selector.join("|"));
}
