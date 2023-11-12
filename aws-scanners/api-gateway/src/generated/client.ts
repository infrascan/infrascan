import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): ApiGatewayV2Client {
  return new ApiGatewayV2Client({
    credentials,
    region: context.region,
    retryStrategy,
  });
}
