import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): AutoScalingClient {
  return new AutoScalingClient({ credentials, region: context.region });
}
