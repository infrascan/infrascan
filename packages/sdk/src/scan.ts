import { EC2 } from '@aws-sdk/client-ec2';
import { GetCallerIdentityCommandOutput, STS } from '@aws-sdk/client-sts';
import { IAM } from '@aws-sdk/client-iam';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type {
  ServiceScanCompleteCallbackFn,
  ResolveStateFromServiceFn,
  RegionalService,
  GlobalService,
  Service
} from '@infrascan/shared-types';
import {
  REGIONAL_SERVICE_SCANNERS,
  GLOBAL_SERVICE_SCANNERS,
} from './aws/services/index.generated';
import { IAMStorage } from './aws/helpers/iam';
import { AWS_DEFAULT_REGION } from './aws/defaults';

// Rather than relying on an account id being supplied, we fetch it from STS before scanning.
async function whoami(
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
async function getAllRegions(
  credentials: AwsCredentialIdentityProvider,
): Promise<string[]> {
  const ec2Client = new EC2({ region: AWS_DEFAULT_REGION, credentials });
  const { Regions } = await ec2Client.describeRegions({ AllRegions: true });
  return Regions?.map(({ RegionName }) => RegionName as string) ?? [];
}

// All supported services
export type ServiceList = Service[];

// Parameters required to perform a scan
export type PerformScanOptions = {
  /**
   * An [AWSCredentialIdentityProvider](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-types/TypeAlias/AwsCredentialIdentityProvider/) instance for 
   * the account to be scanned
   */
  credentials: AwsCredentialIdentityProvider;
  /**
   * Callback to persisting scan state
   */
  onServiceScanComplete: ServiceScanCompleteCallbackFn;
  /**
   * Callback for querying scan state
   */ 
  resolveStateForServiceCall: ResolveStateFromServiceFn;
  /**
   * An optional list of regions to scan. Defaults to all available regions for an account.
   */ 
  regions?: string[];
  /**
   * An optional list of services to scan. Defaults to all defined services within Infrascan's Config.
   */ 
  services?: ServiceList;
};

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

/**
 * Entrypoint for scanning an account. This is a long running async function.
 * 
 * The callbacks given in the {@link scanOptions} are invoked to store ({@link onServiceScanComplete}) 
 * and retrieve ({@link resolveStateForServiceCall}) state as needed.
 * 
 * When the account scan is complete, the {@link ScanMetadata} will be returned.
 */
export async function performScan(scanOptions: PerformScanOptions) {
  const {
    credentials,
    regions,
    services,
    onServiceScanComplete,
    resolveStateForServiceCall,
  } = scanOptions;
  const globalCaller = await whoami(credentials, AWS_DEFAULT_REGION);

  if (globalCaller?.Account == null) {
    throw new Error('Failed to get caller identity');
  }

  const scanMetadata: ScanMetadata = {
    account: globalCaller?.Account,
    regions: [],
  };

  const iamClient = new IAM({ credentials });
  const iamStorage = new IAMStorage();
  console.log(`Scanning global resources in ${globalCaller.Account}`);

  let globalServicesToScan = Object.keys(
    GLOBAL_SERVICE_SCANNERS,
  ) as GlobalService[];
  if (services?.length != null) {
    globalServicesToScan = globalServicesToScan.filter(
      (service) => services.includes(service),
    ) as GlobalService[];
  }

  for (const globalServiceScanner of globalServicesToScan) {
    for (const scanner of GLOBAL_SERVICE_SCANNERS[globalServiceScanner]) {
      await scanner(
        credentials,
        globalCaller.Account as string,
        AWS_DEFAULT_REGION,
        iamClient,
        iamStorage,
        onServiceScanComplete,
        resolveStateForServiceCall,
      );
    }
  }

  const regionsToScan = regions ?? (await getAllRegions(credentials));

  for (const region of regionsToScan) {
    const caller = await whoami(credentials, region);
    if (caller.Account == null) {
      throw new Error('Failed to get caller identity');
    }
    console.log(`Beginning scan of ${caller.Account} in ${region}`);
    let regionalServicesToScan = Object.keys(
      REGIONAL_SERVICE_SCANNERS,
    ) as RegionalService[];
    if (services?.length != null) {
      console.log('Filtering services according to supplied list', {
        services,
      });
      regionalServicesToScan = regionalServicesToScan.filter(
        (service) => services.includes(service),
      ) as RegionalService[];
    }

    for (const regionalService of regionalServicesToScan) {
      for (const scanner of REGIONAL_SERVICE_SCANNERS[regionalService]) {
        await scanner(
          credentials,
          globalCaller.Account as string,
          region,
          iamClient,
          iamStorage,
          onServiceScanComplete,
          resolveStateForServiceCall,
        );
      }
    }

    console.log(`Scan of ${caller.Account} in ${region} complete`);
    scanMetadata.regions.push(region);
  }

  await onServiceScanComplete(
    globalCaller.Account,
    AWS_DEFAULT_REGION,
    'IAM',
    'roles',
    iamStorage.getAllRoles(),
  );
  return scanMetadata;
}

export {
  ServiceScanCompleteCallbackFn,
  ResolveStateFromServiceFn
};