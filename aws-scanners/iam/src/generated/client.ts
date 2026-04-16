import { IAMClient } from "@aws-sdk/client-iam";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("iam:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): IAMClient {
  clientDebug("Creating instance with context", context);
  return new IAMClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
