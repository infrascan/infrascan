import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("auto-scaling:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): AutoScalingClient {
  clientDebug("Creating instance with context", context);
  return new AutoScalingClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
