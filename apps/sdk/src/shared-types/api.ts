export type ServiceScanCompleteCallbackFn = (
  account: string,
  region: string,
  service: string,
  functionName: string,
  functionState: any
) => void;

export type ResolveStateFromServiceFn = (
  account: string,
  region: string,
  service: string,
  functionName: string
) => void;
