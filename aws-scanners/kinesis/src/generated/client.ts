import { KinesisClient } from "@aws-sdk/client-kinesis";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): KinesisClient {
  return new KinesisClient({ credentials, region: context.region });
}
