import { ECSClient } from "@aws-sdk/client-ecs";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): ECSClient {
  return new ECSClient({ credentials, region: context.region });
}
