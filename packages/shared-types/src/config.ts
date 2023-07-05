export type ParameterResolver = {
  Key: string;
  Selector?: string;
  Value?: any;
};

export type EdgeResolver = {
  state: string;
  from: string;
  to: string;
};

export type PaginationToken = {
  request?: string;
  response?: string;
};

export type ServiceGetter = {
  fn: string;
  parameters?: ParameterResolver[];
  formatter?: string;
  paginationToken?: PaginationToken;
  iamRoleSelectors?: string[];
};

export type ScannerDefinition = {
  service: string;
  clientKey: string;
  key: string;
  getters: ServiceGetter[];
  arnLabel?: string;
  nodes?: string[];
  edges?: EdgeResolver[];
  iamRoles?: string[];
  isGlobal?: boolean;
};
