import * as Lambda from "@aws-sdk/client-lambda";

export type LambdaFunctions = "ListFunctions" | "GetFunction";

type AsCommand<S extends string> = `${S}Command`;
type AvailableCommand<
  Serv extends object, 
  Funcs extends string
> = AsCommand<Funcs> extends `${infer P}Command` & keyof Serv
  ? P 
  : never;

type StateSelector<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = `${ServiceName}|${AvailableCommand<Serv, Funcs>}|${string}`;

type EdgeSelector<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = {
  state: StateSelector<ServiceName, Serv, Funcs>;
  to: string;
  from: string;
};

type BaseParameterResolver = {
  Key: string;
};

type ConstantParameterResolver = {
  Value: any
} & BaseParameterResolver;

type StatefulParameterResolver<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = {
  Selector: StateSelector<ServiceName, Serv, Funcs>;
} & BaseParameterResolver;

type ParameterResolver<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = ConstantParameterResolver | StatefulParameterResolver<ServiceName, Serv, Funcs>;

type PaginationToken = {
  request: string;
  response: string;
};

type ServiceGetter<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = {
  id?: string;
  fn: AvailableCommand<Serv, Funcs>;
  paginationToken?: PaginationToken;
  parameters?: ParameterResolver<ServiceName, Serv, Funcs>[];
  iamRoleSelectors?: string[];
};

type ScannerDefinition<
  ServiceName extends string, 
  Serv extends object, 
  Funcs extends string
> = {
  provider: string;
  service: string;
  clientKey: ServiceName;
  key: string;
  callPerRegion: boolean;
  getters: ServiceGetter<ServiceName, Serv, Funcs>[];
  nodes?: StateSelector<ServiceName, Serv, Funcs>[];
  edges?: EdgeSelector<ServiceName, Serv, Funcs>[];
  iamRoles?: StateSelector<ServiceName, Serv, Funcs>[];
};

const LambdaScanner: ScannerDefinition<"Lambda", typeof Lambda, LambdaFunctions> = {
  provider: "aws",
  service: "lambda",
  clientKey: "Lambda",
  key: "Lambda",
  callPerRegion: true,
  getters: [
    {
      fn: "ListFunctions",
      paginationToken: {
        request: "Marker",
        response: "NextMarker",
      },
    },
    {
      fn: "GetFunction",
      parameters: [
        {
          Key: "FunctionName",
          Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
        },
      ],
      iamRoleSelectors: ["Configuration.Role"],
    },
  ],
  nodes: [
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
  ],
  iamRoles: [
    "Lambda|GetFunction|[]._result.Configuration | [].{arn:Role,executor:FunctionArn}",
  ],
};

export default LambdaScanner;