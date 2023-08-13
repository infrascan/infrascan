export type ServiceScanCompleteCallbackFn = (
  account: string,
  region: string,
  service: string,
  functionName: string,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  functionState: any
) => Promise<void>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ResolveStateFromServiceFn = (
  account: string,
  region: string,
  service: string,
  functionName: string
) => Promise<any>;
