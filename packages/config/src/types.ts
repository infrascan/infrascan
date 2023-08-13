import type {
  BaseEdgeResolver,
  BaseGetter,
  BaseParameterResolver,
  BaseScannerDefinition,
  Service,
  GlobalService,
  ServiceClients
} from "@infrascan/shared-types";

import * as Formatters from "./formatters";

type AsCommand<T extends string> = `${T}Command`;

export type ServiceCommand<
  S extends Service,
  T extends string
> = AsCommand<T> extends `${infer P}Command` & keyof typeof ServiceClients[S]
  ? P
  : never;

export type StateSelector<
  S extends Service,
  T extends string
> = `${S}|${ServiceCommand<S, T>}|${string}`;

export type ParameterResolver<
  Serv extends Service,
  T extends string
> = {
  Selector?: StateSelector<Serv, T>;
} & BaseParameterResolver;

export type EdgeResolver<Serv extends Service, T extends string> = {
  state: StateSelector<Serv, T>;
} & BaseEdgeResolver;

type ImplementedFormatter<Serv extends Service> =
  Serv extends keyof typeof Formatters
    ? keyof (typeof Formatters)[Serv]
    : never;

export type ServiceGetter<Serv extends Service, T extends string> = {
  fn: ServiceCommand<Serv, T>;
  parameters?: ParameterResolver<Serv, T>[];
  formatter?: ImplementedFormatter<Serv>;
} & BaseGetter;

export type ScannerDefinition<
  Serv extends Service,
  T extends string
> = {
  clientKey: Serv;
  getters: ServiceGetter<Serv, T>[];
  nodes?: StateSelector<Serv, T>[];
  edges?: EdgeResolver<Serv, T>[];
  iamRoles?: StateSelector<Serv, T>[];
  isGlobal?: Serv extends GlobalService ? true : false;
} & BaseScannerDefinition;
