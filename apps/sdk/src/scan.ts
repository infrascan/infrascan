import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type {
  ServiceScanCompleteCallbackFn,
  ResolveStateFromServiceFn,
} from "@shared-types/api";

import { EC2 } from "@aws-sdk/client-ec2";
import { GetCallerIdentityCommandOutput, STS } from "@aws-sdk/client-sts";
import {
  REGIONAL_SERVICE_SCANNERS,
  GLOBAL_SERVICE_SCANNERS,
} from "./aws/services/index.generated";
import { IAMStorage } from "./aws/helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { AWS_DEFAULT_REGION } from "./aws/defaults";

async function whoami(
  credentials: AwsCredentialIdentityProvider,
  region: string
): Promise<GetCallerIdentityCommandOutput> {
  const stsClient = new STS({
    credentials,
    region,
  });
  return await stsClient.getCallerIdentity({});
}

async function getAllRegions(
  credentials: AwsCredentialIdentityProvider
): Promise<string[]> {
  const ec2Client = new EC2({ region: AWS_DEFAULT_REGION, credentials });
  const { Regions } = await ec2Client.describeRegions({ AllRegions: true });
  return Regions?.map(({ RegionName }) => RegionName as string) ?? [];
}

export type PerformScanOptions = {
  credentials: AwsCredentialIdentityProvider;
  regions?: string[];
  services?: string[];
  onServiceScanComplete: ServiceScanCompleteCallbackFn;
  resolveStateForServiceCall: ResolveStateFromServiceFn;
};

export type ScanMetadata = {
  account: string;
  regions: string[];
};

export type GlobalService = keyof typeof GLOBAL_SERVICE_SCANNERS;
export type RegionalService = keyof typeof REGIONAL_SERVICE_SCANNERS;
export type ServiceList = (GlobalService | RegionalService)[];

export async function performScan({
  credentials,
  regions,
  services,
  onServiceScanComplete,
  resolveStateForServiceCall,
}: PerformScanOptions) {
  const globalCaller = await whoami(credentials, AWS_DEFAULT_REGION);

  if (globalCaller?.Account == null) {
    throw new Error("Failed to get caller identity");
  }

  const scanMetadata: ScanMetadata = {
    account: globalCaller?.Account,
    regions: [],
  };

  const iamClient = new IAM({ credentials });
  const iamStorage = new IAMStorage();
  console.log(`Scanning global resources in ${globalCaller.Account}`);

  let globalServicesToScan = Object.keys(
    GLOBAL_SERVICE_SCANNERS
  ) as GlobalService[];
  if (services?.length != null) {
    globalServicesToScan = Object.keys(GLOBAL_SERVICE_SCANNERS).filter(
      (service) => services.includes(service)
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
        resolveStateForServiceCall
      );
    }
  }

  const regionsToScan = regions ?? (await getAllRegions(credentials));

  for (const region of regionsToScan) {
    const caller = await whoami(credentials, region);
    if (caller.Account == null) {
      throw new Error("Failed to get caller identity");
    }
    console.log(`Beginning scan of ${caller.Account} in ${region}`);
    let regionalServicesToScan = Object.keys(
      REGIONAL_SERVICE_SCANNERS
    ) as RegionalService[];
    if (services?.length != null) {
      console.log(`Filtering services according to supplied list`, {
        services,
      });
      regionalServicesToScan = Object.keys(REGIONAL_SERVICE_SCANNERS).filter(
        (service) => services.includes(service)
      ) as RegionalService[];
    }

    for (const regionalService of regionalServicesToScan) {
      for (const scanner of REGIONAL_SERVICE_SCANNERS[regionalService]) {
        await scanner(
          credentials,
          globalCaller.Account as string,
          AWS_DEFAULT_REGION,
          iamClient,
          iamStorage,
          onServiceScanComplete,
          resolveStateForServiceCall
        );
      }
    }

    console.log(`Scan of ${caller.Account} in ${region} complete`);
    scanMetadata.regions.push(region);
  }
  return scanMetadata;
}
