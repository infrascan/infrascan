import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
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
): CloudWatchLogsClient {
  return new CloudWatchLogsClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
