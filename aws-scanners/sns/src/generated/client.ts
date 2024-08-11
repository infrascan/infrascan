import { SNSClient } from "@aws-sdk/client-sns";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("sns:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): SNSClient {
  clientDebug("Creating instance with context", context);
  return new SNSClient({ credentials, region: context.region, retryStrategy });
}
