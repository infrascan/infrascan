import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { AwsContext } from "@infrascan/shared-types";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): DynamoDBClient {
  return new DynamoDBClient({ credentials, region: context.region });
}
