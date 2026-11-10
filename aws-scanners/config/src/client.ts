import { ConfigServiceClient } from "@aws-sdk/client-config-service";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("config:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): ConfigServiceClient {
  clientDebug("Creating instance with context", context);
  return new ConfigServiceClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
