import { Route53Client } from "@aws-sdk/client-route-53";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("route-53:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): Route53Client {
  clientDebug("Creating instance with context", context);
  return new Route53Client({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
