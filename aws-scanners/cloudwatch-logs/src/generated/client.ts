import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): CloudWatchLogsClient {
  return new CloudWatchLogsClient({ credentials, region: context.region });
}
