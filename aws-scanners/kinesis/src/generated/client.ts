import { KinesisClient } from "@aws-sdk/client-kinesis";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): KinesisClient {
  return new KinesisClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
