import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("cloudfront:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): CloudFrontClient {
  clientDebug("Creating instance with context", context);
  return new CloudFrontClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
