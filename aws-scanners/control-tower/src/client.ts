import { ControlTowerClient } from "@aws-sdk/client-controltower";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("controltower:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): ControlTowerClient {
  clientDebug("Creating instance with context", context);
  return new ControlTowerClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
