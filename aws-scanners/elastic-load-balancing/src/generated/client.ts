import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";
import debug from "debug";

const clientDebug = debug("elastic-load-balancing-v2:client");

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): ElasticLoadBalancingV2Client {
  clientDebug("Creating instance with context", context);
  return new ElasticLoadBalancingV2Client({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
