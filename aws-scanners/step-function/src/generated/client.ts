import { SFNClient } from "@aws-sdk/client-sfn";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("sfn:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): SFNClient {
  clientDebug("Creating instance with context", context);
  return new SFNClient({ credentials, region: context.region, retryStrategy });
}
