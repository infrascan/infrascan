import { EC2 } from "@aws-sdk/client-ec2";
import { GetCallerIdentityCommandOutput, STS } from "@aws-sdk/client-sts";
import { IAM } from "@aws-sdk/client-iam";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type {
  AwsContext,
  Connector,
  ServiceModule,
} from "@infrascan/shared-types";
import { IAMStorage, scanIamRole } from "./aws/helpers/iam";

// Rather than relying on an account id being supplied, we fetch it from STS before scanning.
export async function whoami(
  credentials: AwsCredentialIdentityProvider,
  region: string,
): Promise<GetCallerIdentityCommandOutput> {
  const stsClient = new STS({
    credentials,
    region,
  });
  return stsClient.getCallerIdentity({});
}

// If no regions are given for a scan, we retrieve all supported regions in this account.
// This is exposed in the EC2 API.
export async function getAllRegions(
  credentials: AwsCredentialIdentityProvider,
  region: string,
  regionFilter?: string[],
): Promise<string[]> {
  const ec2Client = new EC2({ region, credentials });
  const { Regions } = await ec2Client.describeRegions({ AllRegions: true });
  const awsRegions =
    Regions?.map(({ RegionName }) => RegionName as string) ?? [];
  if (regionFilter != null) {
    return awsRegions.filter((awsRegion) => regionFilter.includes(awsRegion));
  }
  return awsRegions;
}

/**
 * Returned type from a call to perform scan
 */
export type ScanMetadata = {
  /**
   * The account ID scanned
   */
  account: string;
  /**
   * The regions scanned
   */
  regions: string[];
};

export async function scanService(
  serviceScanner: ServiceModule<unknown, "aws">,
  credentials: AwsCredentialIdentityProvider,
  connector: Connector,
  iamStorage: IAMStorage,
  iamClient: IAM,
  context: AwsContext,
): Promise<void> {
  const serviceClient = serviceScanner.getClient(credentials, context);
  for (const scannerFn of serviceScanner.getters) {
    await scannerFn(serviceClient, connector, context);
  }
  if (serviceScanner.getIamRoles != null) {
    const iamRoles = await serviceScanner.getIamRoles(connector);
    await Promise.all(
      iamRoles.map(({ roleArn }) =>
        scanIamRole(iamStorage, iamClient, roleArn),
      ),
    );
  }
}
