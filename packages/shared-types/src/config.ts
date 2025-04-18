export type GenericEdgeSelector = `${string}|${string}`;

export type BaseEdgeResolver = {
  state: GenericEdgeSelector;
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
  parameters?: (BaseParameterResolver & { Value?: any; Selector?: string })[];
  formatter?: string;
  paginationToken?: PaginationToken;
};

export type GenericNodeSelector = `${string}|${string}|${string}`;

export type BaseScannerDefinition = {
  provider?: string;
  // Name of the service to be scanned
  service: string;
  // Key of the client in imported SDK
  clientKey: string;
  // Label used to identify this service within AWS ARNs
  arnLabel?: string;
  // Default 'type' for the generated graph entities, useful for applying a default style to a service's nodes.
  key: string;
  // Should the codegen skip implementing the client builder. Defaults to false.
  skipClientBuilder?: boolean;
  // Should this scanner be called in every region, or is it considered global (e.g. S3, Cloudfront, Route53)
  callPerRegion: boolean;
  // Scanner functions for pulling state from a service
  getters: BaseGetter[];
  // Scrapers for pulling Edges from service state
  edges?: BaseEdgeResolver[];
  // Scrapers for pulling IAM Roles from service state, used to generate permission based edges
  iamRoles?: GenericNodeSelector[];
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
  Value?: any;
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
};

export type ScannerDefinition<
  ServiceName extends string,
  Serv extends object,
  Funcs extends string,
> = {
  provider: string;
  service: string;
  clientKey: ServiceName;
  arnLabel?: string;
  key: string;
  skipClientBuilder?: boolean;
  callPerRegion: boolean;
  getters: ServiceGetter<ServiceName, Serv, Funcs>[];
  edges?: EdgeSelector<ServiceName, Serv, Funcs>[];
  iamRoles?: StateSelector<ServiceName, Serv, Funcs>[];
};
