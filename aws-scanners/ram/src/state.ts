import type {
  AwsContext,
  CommandCallMetadata,
  Connector,
} from "@infrascan/shared-types";
import debug from "debug";

const stateDebug = debug("ram:state");

/**
 * The error AWS returned for a call. Kept in state because a denied call, or a call that tells us the account is not
 * in an organization, is information about the account rather than an absence of it.
 */
export interface CallError {
  name: string;
  message?: string;
}

/**
 * One recorded API call: the response on success, or the error on failure.
 */
export interface CallState<Output, Input> {
  _metadata: CommandCallMetadata;
  _parameters?: Input;
  _result?: Output;
  _error?: CallError;
}

export function toCallError(err: unknown): CallError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: "UnknownError", message: String(err) };
}

/**
 * Names of the request and response fields that carry the pagination token, usually `NextToken` on both sides.
 */
export interface PaginationToken {
  request: string;
  response: string;
}

/**
 * Send a command, following pagination tokens, and record every page or the error that ended it.
 */
export async function call<Input extends object, Output extends object>(
  context: AwsContext,
  send: (input: Input) => Promise<Output>,
  input: Input,
  token?: PaginationToken,
): Promise<CallState<Output, Input>[]> {
  const pages: CallState<Output, Input>[] = [];
  let next: unknown;
  do {
    const parameters: Input =
      token != null && next != null
        ? { ...input, [token.request]: next }
        : { ...input };
    const callMetadata: CommandCallMetadata = {
      account: context.account,
      region: context.region,
      partition: context.partition,
      timestamp: Date.now(),
    };
    try {
      const result = await send(parameters);
      pages.push({
        _metadata: callMetadata,
        _parameters: parameters,
        _result: result,
      });
      next =
        token != null
          ? (result as Record<string, unknown>)[token.response]
          : undefined;
    } catch (err: unknown) {
      const error = toCallError(err);
      stateDebug(`Call failed with ${error.name}`, parameters);
      pages.push({
        _metadata: callMetadata,
        _parameters: parameters,
        _error: error,
      });
      next = undefined;
    }
  } while (next != null);
  return pages;
}

export async function recordState(
  connector: Connector,
  context: AwsContext,
  functionName: string,
  state: CallState<unknown, unknown>[],
): Promise<void> {
  await connector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "RAM",
    functionName,
    state,
  );
}
