import type {
  BaseEdgeResolver,
  BaseGetter,
  BaseParameterResolver,
  BaseScannerDefinition,
  Service,
  GlobalService,
  ServiceClients,
} from "@infrascan/shared-types";

import * as Formatters from "./formatters";

type AsCommand<T extends string> = `${T}Command`;

/**
 * Type bound to map the function defined in a config to an AWS SDK
 * command in a supported client. If no match is found, the type is invalid.
 */
export type ServiceCommand<
  S extends Service,
  T extends string,
> = AsCommand<T> extends `${infer P}Command` & keyof (typeof ServiceClients)[S]
  ? P
  : never;

/**
 * Type bound to only allow selectors to be called on supported services with known commands.
 */
export type StateSelector<
  S extends Service,
  T extends string,
> = `${S}|${ServiceCommand<S, T>}|${string}`;

/**
 * Type bound to allow parameter resolvers to read from state.
 */
export type ParameterResolver<Serv extends Service, T extends string> = {
  Selector?: StateSelector<Serv, T>;
} & BaseParameterResolver;

/**
 * Type bound to ensure that edge resolvers are operating over known state.
 */
export type EdgeResolver<Serv extends Service, T extends string> = {
  state: StateSelector<Serv, T>;
} & BaseEdgeResolver;

/**
 * Type bound to prevent unsupported formatters being set in the config
 */
export type ImplementedFormatter<Serv extends Service> =
  Serv extends keyof typeof Formatters
    ? keyof (typeof Formatters)[Serv]
    : never;

/**
 * Getter for an integrated service. Defines what function to call in the relevant SDK,
 * what parameters to provide, and how to format the resultant state.
 */
export type ServiceGetter<Serv extends Service, T extends string> = {
  fn: ServiceCommand<Serv, T>;
  parameters?: ParameterResolver<Serv, T>[];
  formatter?: ImplementedFormatter<Serv>;
} & BaseGetter;

/**
 * Type definition for a service scanner within the Infrascan Config.
 *
 * Adds type checking to guarantee the service is supported, the functions are
 * exposed in the service's SDK, and that the selectors are referencing scanned functions.
 */
export type ScannerDefinition<Serv extends Service, T extends string> = {
  clientKey: Serv;
  getters: ServiceGetter<Serv, T>[];
  nodes?: StateSelector<Serv, T>[];
  edges?: EdgeResolver<Serv, T>[];
  iamRoles?: StateSelector<Serv, T>[];
  isGlobal?: Serv extends GlobalService ? true : false;
} & BaseScannerDefinition;
