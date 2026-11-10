import { Inspector2Client } from "@aws-sdk/client-inspector2";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("inspector2:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): Inspector2Client {
  clientDebug("Creating instance with context", context);
  return new Inspector2Client({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
