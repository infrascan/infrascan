import { CloudTrailClient } from "@aws-sdk/client-cloudtrail";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("cloudtrail:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): CloudTrailClient {
  clientDebug("Creating instance with context", context);
  return new CloudTrailClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
