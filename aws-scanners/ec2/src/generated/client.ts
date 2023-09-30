import { EC2Client } from "@aws-sdk/client-ec2";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): EC2Client {
  return new EC2Client({ credentials, region: context.region });
}
