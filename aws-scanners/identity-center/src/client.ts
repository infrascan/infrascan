import { SSOAdminClient } from "@aws-sdk/client-sso-admin";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("identitycenter:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): SSOAdminClient {
  clientDebug("Creating instance with context", context);
  return new SSOAdminClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
