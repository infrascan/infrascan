import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
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
): CloudFrontClient {
  return new CloudFrontClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
