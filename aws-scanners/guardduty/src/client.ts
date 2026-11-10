import { GuardDutyClient } from "@aws-sdk/client-guardduty";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("guardduty:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): GuardDutyClient {
  clientDebug("Creating instance with context", context);
  return new GuardDutyClient({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
