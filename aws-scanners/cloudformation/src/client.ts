import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("cloudformation:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): CloudFormationClient {
  clientDebug("Creating instance with context", context);
  return new CloudFormationClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
