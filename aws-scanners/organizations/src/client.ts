import { OrganizationsClient } from "@aws-sdk/client-organizations";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("organizations:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): OrganizationsClient {
  clientDebug("Creating instance with context", context);
  return new OrganizationsClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
