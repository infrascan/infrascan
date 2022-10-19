import { Cluster } from "aws-sdk/clients/ecs";

// this type is totally open, is mainly here for legibility
type ParameterValue = string | number | boolean | Array<any> | object;
export interface StaticParameter {
  key: string,
  value: ParameterValue
}
export type SupportedOperators = "for_each";
export interface LookupParameter {
  key: string,
  sourceFunctionCall: string,
  selector: ((previousFnOutput: any) => any),
}
export interface DynamicParameter extends LookupParameter {
  operator: SupportedOperators
}

export function isDynamicParameter(param: StaticParameter | DynamicParameter): param is DynamicParameter {
  return (param as DynamicParameter).sourceFunctionCall !== undefined;
}

export interface FunctionParameters {
  [key: string]: (StaticParameter | DynamicParameter)
}

export interface ApiCall {
  functionName: string,
  staticParameters?: StaticParameter[],
  lookupParameters?: LookupParameter[],
  dynamicParameter?: DynamicParameter
};

type SupportedService = "ECS" | "Lambda";
type ServiceConfig = {
  service: SupportedService,
  apiCalls: ApiCall[]
};
type Config = Array<ServiceConfig>;
export const servicesConfig: Config = [{
    service: "ECS",
    apiCalls: [
      {
        functionName: "listClusters"
      },
      {
        functionName: "listTasks",
        dynamicParameter: {
          key: "cluster",
          sourceFunctionCall: "listClusters",
          selector: (clusters: AWS.ECS.ListClustersResponse): Array<string> | undefined => {
            return clusters.clusterArns;
          },
          operator: "for_each"
        }
      }
    ]
  }
];
export const DEFAULT_REGION = 'us-east-1';