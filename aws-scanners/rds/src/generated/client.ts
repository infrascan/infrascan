import { RDSClient } from "@aws-sdk/client-rds";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("rds:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): RDSClient {
  clientDebug("Creating instance with context", context);
  return new RDSClient({ credentials, region: context.region, retryStrategy });
}
