import { SNSClient } from "@aws-sdk/client-sns";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): SNSClient {
  return new SNSClient({ credentials, region: context.region });
}
