import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): ApiGatewayV2Client {
  return new ApiGatewayV2Client({ credentials, region: context.region });
}
