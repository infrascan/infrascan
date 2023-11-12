import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
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
): DynamoDBClient {
  return new DynamoDBClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
