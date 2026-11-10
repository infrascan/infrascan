import { FMSClient } from "@aws-sdk/client-fms";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("fms:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): FMSClient {
  clientDebug("Creating instance with context", context);
  return new FMSClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
