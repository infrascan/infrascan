import { RAMClient } from "@aws-sdk/client-ram";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("ram:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): RAMClient {
  clientDebug("Creating instance with context", context);
  return new RAMClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
