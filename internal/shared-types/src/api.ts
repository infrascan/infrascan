export type ServiceScanCompleteCallbackFn = (
  account: string,
  region: string,
  service: string,
  functionName: string,
  functionState: any
) => Promise<void>;

export type ResolveStateFromServiceFn = (
  account: string,
  region: string,
  service: string,
  functionName: string
) => Promise<any>;
