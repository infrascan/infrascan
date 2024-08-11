import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("sqs:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): SQSClient {
  clientDebug("Creating instance with context", context);
  return new SQSClient({ credentials, region: context.region, retryStrategy });
}
