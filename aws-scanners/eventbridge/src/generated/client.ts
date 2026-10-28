import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";
const clientDebug = debug("eventbridge:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): EventBridgeClient {
  clientDebug("Creating instance with context", context);
  return new EventBridgeClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
