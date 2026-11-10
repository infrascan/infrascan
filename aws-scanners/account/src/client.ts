import { AccountClient } from "@aws-sdk/client-account";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("account:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): AccountClient {
  clientDebug("Creating instance with context", context);
  return new AccountClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
