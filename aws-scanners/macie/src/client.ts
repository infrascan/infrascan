import { Macie2Client } from "@aws-sdk/client-macie2";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("macie2:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): Macie2Client {
  clientDebug("Creating instance with context", context);
  return new Macie2Client({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
