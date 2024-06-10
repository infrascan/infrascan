import { EC2 } from "@aws-sdk/client-ec2";
import { GetCallerIdentityCommandOutput, STS } from "@aws-sdk/client-sts";
import { IAM } from "@aws-sdk/client-iam";
import { AdaptiveRetryStrategy } from "@smithy/util-retry";

import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type {
  AwsContext,
  Connector,
  ServiceModule,
} from "@infrascan/shared-types";
import { IAMStorage, scanIamRole } from "./aws/helpers/iam";

/**
 * Type signature for a credential provider factory which produces an AWS credential provider based on the provided region.
 */
export type CredentialProviderFactory = (
  region: string,
) => AwsCredentialIdentityProvider | Promise<AwsCredentialIdentityProvider>;

/**
 * Union type for any accepted credential provider. Either an {@link AwsCredentialIdentityProvider} or a {@link CredentialProviderFactory}
 */
export type ScanCredentialProvider =
  | AwsCredentialIdentityProvider
  | CredentialProviderFactory;

/**
 * Naive helper function which determines if the given provider is a factory.
 * Based on current type constraints, a simple function-type check is sufficient.
 * @param {ScanCredentialProvider} provider
 * @returns {boolean} isCredentialProviderFactory true if the provider is a factory function.
 */
function isCredentialProviderFactory(
  provider: ScanCredentialProvider,
): provider is CredentialProviderFactory {
  return typeof provider === "function";
}

/**
 * In cases where the AWS config file isn't present to define a default region, the client SDKs will throw
 * a Region is Missing error. Supporting a credential provider factory allows the region to be provided when using STS internally.
 */
export async function resolveCredentialsFromProvider(
  provider: ScanCredentialProvider,
  region: string,
): Promise<AwsCredentialIdentityProvider> {
  if (isCredentialProviderFactory(provider)) {
    return provider(region);
  }
  return provider;
}

/**
 * Helper function to determine the account that we're currently authenticated with. This is done using the AWS STS GetCallerIdentity function.
 * @param {AwsCredentialIdentityProvider} credentials
 * @param {string} region
 * @returns {GetCallerIdentityCommandOutput}
 */
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

/**
 * Helper function to get all active regions on a given account from the EC2 API.
 * @param {AwsCredentialIdentityProvider} credentials
 * @param {string} region
 * @param {string[]} [regionFilter] An optional allowlist of regions.
 * @returns The overlapping regions between the regionFilter and the available regions for the account.
 */
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
  /**
   * The region considered as default for the scan. Used to scrape state for global services.
   */
  defaultRegion: string;
};

/**
 * Execute a scan against a single service
 * @param {ServiceModule<unknown, "aws">} serviceScanner Some defined service scanner
 * @param {AwsCredentialIdentityProvider} credentials
 * @param {Connector} connector
 * @param {IAMStorage} iamStorage
 * @param {IAM} iamClient
 * @param {AwsContext} context The current scan context
 * @returns {Promise<void>} Resolves after all scan calls have completed, and the state has been persisted via the connector.
 */
export async function scanService(
  serviceScanner: ServiceModule<unknown, "aws">,
  credentials: AwsCredentialIdentityProvider,
  connector: Connector,
  iamStorage: IAMStorage,
  iamClient: IAM,
  context: AwsContext,
): Promise<void> {
  const serviceClient = serviceScanner.getClient(
    credentials,
    context,
    new AdaptiveRetryStrategy(async () => 5),
  );
  for (const scannerFn of serviceScanner.getters) {
    await scannerFn(serviceClient, connector, context);
  }
  if (serviceScanner.getIamRoles != null) {
    const iamRoles = await serviceScanner.getIamRoles(connector);
    await Promise.all(
      iamRoles.map(({ roleArn }) =>
        scanIamRole(iamStorage, iamClient, roleArn).catch((err) => {
          console.error("An error occurred while scanning role:", roleArn);
          if (err instanceof Error) {
            console.error(err.message);
          }
        }),
      ),
    );
  }
}
