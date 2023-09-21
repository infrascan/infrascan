import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): CloudFrontClient {
  return new CloudFrontClient({ credentials, region: context.region });
}
