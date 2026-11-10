import { SecurityLakeClient } from "@aws-sdk/client-securitylake";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("securitylake:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): SecurityLakeClient {
  clientDebug("Creating instance with context", context);
  return new SecurityLakeClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
