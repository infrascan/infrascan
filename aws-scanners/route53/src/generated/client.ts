import { Route53Client } from "@aws-sdk/client-route-53";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): Route53Client {
  return new Route53Client({ credentials, region: context.region });
}
