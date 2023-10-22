import { LambdaClient } from "@aws-sdk/client-lambda";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): LambdaClient {
  return new LambdaClient({ credentials, region: context.region });
}
