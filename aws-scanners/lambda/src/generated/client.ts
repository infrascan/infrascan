import { LambdaClient } from "@aws-sdk/client-lambda";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  region: string,
): LambdaClient {
  return new LambdaClient({ credentials, region });
}
