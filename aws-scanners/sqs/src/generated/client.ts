import { SQSClient } from "@aws-sdk/client-sqs";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): SQSClient {
  return new SQSClient({ credentials, region: context.region });
}
