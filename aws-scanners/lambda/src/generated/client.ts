import { LambdaClient } from "@aws-sdk/client-lambda";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("lambda:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): LambdaClient {
  clientDebug("Creating instance with context", context);
  return new LambdaClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
