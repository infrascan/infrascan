import { ECSClient } from "@aws-sdk/client-ecs";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("ecs:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): ECSClient {
  clientDebug("Creating instance with context", context);
  return new ECSClient({ credentials, region: context.region, retryStrategy });
}
