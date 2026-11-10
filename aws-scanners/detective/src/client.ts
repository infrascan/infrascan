import { DetectiveClient } from "@aws-sdk/client-detective";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("detective:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): DetectiveClient {
  clientDebug("Creating instance with context", context);
  return new DetectiveClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
