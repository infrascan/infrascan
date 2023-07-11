import * as ServiceClients from "./services";
import type { GlobalClient } from "./services";

export type SupportedClient = keyof typeof ServiceClients;
export type ServiceCommand<
  S extends SupportedClient,
  T extends string
> = AsCommand<T> extends `${infer P}Command` & keyof (typeof ServiceClients)[S]
  ? P
  : never;

type AsCommand<T extends string> = `${T}Command`;

export type StateSelector<
  S extends SupportedClient,
  T extends string
> = `${S}|${ServiceCommand<S, T>}|${string}`;

export type BaseParameterResolver = {
  Key: string;
  Selector?: string;
  Value?: any;
};

export type ParameterResolver<
  Serv extends SupportedClient,
  T extends string
> = {
  Selector?: StateSelector<Serv, T>;
} & BaseParameterResolver;

export type BaseEdgeResolver = {
  state: string;
  from: string;
  to: string;
};
export type EdgeResolver<Serv extends SupportedClient, T extends string> = {
  state: StateSelector<Serv, T>;
} & BaseEdgeResolver;

export type PaginationToken = {
  request?: string;
  response?: string;
};

export type BaseGetter = {
  fn: string;
  parameters?: BaseParameterResolver[];
  formatter?: string;
  paginationToken?: PaginationToken;
  iamRoleSelectors?: string[];
};

export type ServiceGetter<Serv extends SupportedClient, T extends string> = {
  fn: ServiceCommand<Serv, T>;
  parameters?: ParameterResolver<Serv, T>[];
} & BaseGetter;

export type ScannerBase = {
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

export type ScannerDefinition<
  Serv extends SupportedClient,
  T extends string
> = {
  clientKey: Serv;
  getters: ServiceGetter<Serv, T>[];
  nodes?: StateSelector<Serv, T>[];
  edges?: EdgeResolver<Serv, T>[];
  iamRoles?: StateSelector<Serv, T>[];
  isGlobal?: Serv extends GlobalClient ? true : false;
} & ScannerBase;
