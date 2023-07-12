import * as ServiceClients from "./services";
import * as Formatters from "./formatters";
import type { GlobalClient } from "./services";
import type {
  BaseEdgeResolver,
  BaseGetter,
  BaseParameterResolver,
  BaseScannerDefinition,
} from "@infrascan/shared-types";

export type { PaginationToken } from "@infrascan/shared-types";

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

export type ParameterResolver<
  Serv extends SupportedClient,
  T extends string
> = {
  Selector?: StateSelector<Serv, T>;
} & BaseParameterResolver;

export type EdgeResolver<Serv extends SupportedClient, T extends string> = {
  state: StateSelector<Serv, T>;
} & BaseEdgeResolver;

type ImplementedFormatter<Serv extends SupportedClient> =
  Serv extends keyof typeof Formatters
    ? keyof (typeof Formatters)[Serv]
    : never;

export type ServiceGetter<Serv extends SupportedClient, T extends string> = {
  fn: ServiceCommand<Serv, T>;
  parameters?: ParameterResolver<Serv, T>[];
  formatter?: ImplementedFormatter<Serv>;
} & BaseGetter;

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
} & BaseScannerDefinition;
