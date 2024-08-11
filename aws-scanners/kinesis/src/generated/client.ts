import { KinesisClient } from "@aws-sdk/client-kinesis";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("kinesis:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): KinesisClient {
  clientDebug("Creating instance with context", context);
  return new KinesisClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
