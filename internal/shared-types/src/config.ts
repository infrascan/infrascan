export type BaseEdgeResolver = {
  state: string;
  from: string;
  to: string;
};

export type PaginationToken = {
  request?: string;
  response?: string;
};

export type BaseGetter = {
  id?: string;
  fn: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  parameters?: (BaseParameterResolver & { Value?: any, Selector?: string })[];
  formatter?: string;
  paginationToken?: PaginationToken;
  iamRoleSelectors?: string[];
};

export type BaseScannerDefinition = {
  provider?: string;
  service: string;
  clientKey: string;
  key: string;
  arnLabel?: string;
  getters: BaseGetter[];
  nodes?: string[];
  edges?: BaseEdgeResolver[];
  iamRoles?: string[];
  isGlobal?: boolean;
};

type AsCommand<S extends string> = `${S}Command`;
export type AvailableCommand<
  Serv extends object,
  Funcs extends string,
> = AsCommand<Funcs> extends `${infer P}Command` & keyof Serv ? P : never;

export type StateSelector<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> = `${ServiceName}|${AvailableCommand<Serv, Funcs>}|${string}`;

export type EdgeSelector<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> = {
  state: StateSelector<ServiceName, Serv, Funcs>;
  to: string;
  from: string;
};

export type BaseParameterResolver = {
  Key: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ConstantParameterResolver = {
  Value: any;
} & BaseParameterResolver;

export type StatefulParameterResolver<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> = {
  Selector: StateSelector<ServiceName, Serv, Funcs>;
} & BaseParameterResolver;

export type GenericStatefulParameterResolver = {
  Selector: string;
} & BaseParameterResolver;

export type ParameterResolver<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> =
  | ConstantParameterResolver
  | StatefulParameterResolver<ServiceName, Serv, Funcs>;

export type GenericParameterResolver = BaseParameterResolver & {
  Selector?: string;
  Value?: string;
};

export type ServiceGetter<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> = {
  id?: string;
  fn: AvailableCommand<Serv, Funcs>;
  paginationToken?: PaginationToken;
  parameters?: ParameterResolver<ServiceName, Serv, Funcs>[];
  iamRoleSelectors?: string[];
};

export type ScannerDefinition<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
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
