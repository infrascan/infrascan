import { RDSClient } from "@aws-sdk/client-rds";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): RDSClient {
  return new RDSClient({ credentials, region: context.region });
}
