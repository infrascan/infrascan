import type { Service } from './services';

/**
 * Callback to store state from a specific function call
 *
 * This is callback is invoked after every full scan of a service endpoint.
 */
export type ServiceScanCompleteCallbackFn = (
  /**
   * The AWS account being scanned
   */
  account: string,
  /**
   * The region being scanned
   */
  region: string,
  /**
   * The service being scanned
   */
  service: Service | 'IAM',
  /**
   * The specific function called during scanning
   */
  functionName: string,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  /**
   * The state retrieved from the function call
   */
  functionState: any,
) => Promise<void>;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Callback to load scan state from a specific service call.
 *
 * This is used by the scan function pull back parameters for future function calls
 * A common pattern is to have resources listed, and then described.
 */
export type ResolveStateForServiceFunction = (
  /**
   * The AWS account that was scanned
   */
  account: string,
  /**
   * The scanned region
   */
  region: string,
  /**
   * The scanned service e.g. Lambda
   */
  service: Service,
  /**
   * The specific function called during the scan e.g. GetFunction
   */
  functionName: string,
) => Promise<any>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GetGlobalStateForServiceFunction = (
  service: string,
  functionName: string,
) => any;

export type Connector = {
  onServiceScanCompleteCallback: ServiceScanCompleteCallbackFn;
  resolveStateForServiceFunction: ResolveStateForServiceFunction;
  getGlobalStateForServiceFunction: GetGlobalStateForServiceFunction;
};
