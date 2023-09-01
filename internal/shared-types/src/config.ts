export type BaseParameterResolver = {
  Key: string;
  Selector?: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  Value?: any;
};

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
  parameters?: BaseParameterResolver[];
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
