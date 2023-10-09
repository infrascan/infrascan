import type {
  ServiceModule,
  Provider,
  Connector,
  GraphElement,
} from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import { IAM } from "@aws-sdk/client-iam";
import { IAMStorage, StoredRole, hydrateRoleStorage } from "aws/helpers/iam";
import { generateEdgesForRole } from "aws/graph/graph-utilities";
import { whoami, getAllRegions, ScanMetadata, scanService } from "./scan";
import { buildAccountNode, buildRegionNode } from "./graph";

const AWS_DEFAULT_REGION = "us-east-1";

/* eslint-disable @typescript-eslint/no-explicit-any */
type ScannerRegistry = {
  [service: string]: ServiceModule<any, Provider>;
};

export default class Infrascan {
  private regionalScannerRegistry: ScannerRegistry;

  private globalScannerRegistry: ScannerRegistry;

  constructor() {
    this.regionalScannerRegistry = {};
    this.globalScannerRegistry = {};
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  registerScanner(scanner: ServiceModule<any, Provider>) {
    const targetRegistry = scanner.callPerRegion
      ? this.regionalScannerRegistry
      : this.globalScannerRegistry;
    if (targetRegistry[scanner.key] != null) {
      throw new Error(
        "Duplicate Scanner - this service scanner was already registered with the Infrascan SDK.",
      );
    }
    targetRegistry[scanner.key] = scanner;
  }

  /**
   * Entrypoint for scanning an account. This is a long running async function.
   *
   * When the account scan is complete, the {@link ScanMetadata} will be returned.
   *
   * Example Code:
   * ```ts
   * import Infrascan from "@infrascan/sdk";
   * import Lambda from "@infrascan/aws-lambda-scanner";
   * import S3 from "@infrascan/aws-s3-scanner";
   * import SNS from "@infrascan/aws-sns-scanner";
   * import BuildFsConnector from "@infrascan/fs-connector";
   * import { fromIni } from "@aws-sdk/credential-providers";
   *
   * const credentials = fromIni({ profile: "dev" });
   *
   * const connector = BuildFsConnector();
   * const infrascan = new Infrascan();
   * infrascan.registerScanner(Lambda);
   * infrascan.registerScanner(S3);
   * infrascan.registerScanner(SNS);
   * infrascan.performScan(
   *  credentials,
   *  connector,
   * ).then(function (scanMetadata) {
   *  console.log("Scan Complete!", scanMetadata);
   * }).catch(function (err) {
   *  console.error("Failed to scan", err);
   * });
   * ```
   */
  async performScan(
    credentials: AwsCredentialIdentityProvider,
    connector: Connector,
    opts?: { regions?: string[] },
  ): Promise<ScanMetadata> {
    const globalCaller = await whoami(credentials, AWS_DEFAULT_REGION);
    if (globalCaller?.Account == null) {
      throw new Error(
        "Failed to get caller identity. Please make sure that the credentials provided are correct.",
      );
    }

    const scanMetadata: ScanMetadata = {
      account: globalCaller.Account,
      regions: [],
    };

    const iamClient = new IAM({ credentials });
    const iamStorage = new IAMStorage();

    const scanContext = {
      account: globalCaller.Account,
      region: AWS_DEFAULT_REGION,
    };

    // Take list of all global services to scan
    const globalServiceEntries = Object.entries(this.globalScannerRegistry);
    for (const [serviceName, serviceScanner] of globalServiceEntries) {
      console.log(`Beginning global scan of ${serviceName}`);
      await scanService(
        serviceScanner,
        credentials,
        connector,
        iamStorage,
        iamClient,
        scanContext,
      );
    }

    // Get all available regions for this account from the AWS API
    const regionsToScan = await getAllRegions(
      credentials,
      AWS_DEFAULT_REGION,
      opts?.regions,
    );
    const regionalServiceEntries = Object.entries(this.regionalScannerRegistry);
    for (const region of regionsToScan) {
      scanContext.region = region;
      console.log(`Beginning scan of ${region}`);
      for (const [serviceName, serviceScanner] of regionalServiceEntries) {
        console.log(`Beginning scan of ${serviceName} in ${region}`);
        await scanService(
          serviceScanner,
          credentials,
          connector,
          iamStorage,
          iamClient,
          scanContext,
        );
        console.log(`Completed scan of ${serviceName} in ${region}`);
      }
      console.log(`Completed scan of ${region}`);
    }

    await connector.onServiceScanCompleteCallback(
      scanContext.account,
      AWS_DEFAULT_REGION,
      "IAM",
      "roles",
      iamStorage.getAllRoles(),
    );

    console.log(`Completed scan of ${scanContext.account}`);
    return scanMetadata;
  }

  /**
   * Entrypoint function to convert one or more scans into an infrastructure graph.
   *
   * * Example Code:
   * ```ts
   * import Infrascan from "@infrascan/sdk";
   * import BuildFsConnector from "@infrascan/fs-connector";
   *
   * const connector = BuildFsConnector();
   * const infrascan = new Infrascan(...);
   * const scanMetadata = await infrascan.performScan({ ... });
   * infrascan.generateGraph(
   *  scanMetadata,
   *  connector
   * ).then(function (graphData) {
   *  console.log("Graph Complete!", graphData);
   * }).catch(function (err) {
   *  console.error("Failed to create graph", err);
   * });
   * ```
   */

  async generateGraph(
    scanMetadata: ScanMetadata[],
    connector: Connector,
  ): Promise<GraphElement[]> {
    const iamStorage = new IAMStorage();
    const iamState: StoredRole[] =
      await connector.getGlobalStateForServiceFunction("IAM", "roles");
    hydrateRoleStorage(iamStorage, iamState);

    const graphElements: GraphElement[] = [];

    const globalServiceEntries = Object.values(this.globalScannerRegistry);
    const regionalServiceEntries = Object.values(this.regionalScannerRegistry);

    for (const { account, regions } of scanMetadata) {
      const context = { account, region: AWS_DEFAULT_REGION };
      const accountNode = buildAccountNode(account);
      graphElements.push(accountNode);

      for (const serviceScanner of globalServiceEntries) {
        if (serviceScanner.getNodes != null) {
          const serviceNodes = await serviceScanner.getNodes(
            connector,
            context,
          );
          if (serviceScanner.formatNode != null) {
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            const formattedNodes = serviceNodes.map((node) =>
              serviceScanner.formatNode!(node, context),
            );
            graphElements.push(...formattedNodes);
          } else {
            graphElements.push(...serviceNodes);
          }
        }
      }

      for (const region of regions) {
        context.region = region;
        const regionNode = buildRegionNode(account, region);
        graphElements.push(regionNode);
        for (const regionalServiceScanner of regionalServiceEntries) {
          if (regionalServiceScanner.getNodes != null) {
            const regionalNodes = await regionalServiceScanner.getNodes(
              connector,
              context,
            );
            if (regionalServiceScanner.formatNode != null) {
              /* eslint-disable @typescript-eslint/no-non-null-assertion */
              const formattedNodes = regionalNodes.map((node) =>
                regionalServiceScanner.formatNode!(node, context),
              );
              graphElements.push(...formattedNodes);
            } else {
              graphElements.push(...regionalNodes);
            }
          }
        }
      }
    }

    // Edges are generated independent of the scan context to allow for cross-region or cross-account linking
    const allServices = globalServiceEntries.concat(regionalServiceEntries);
    for (const scanner of allServices) {
      if (scanner.getEdges != null) {
        const scannerEdges: GraphElement[] = await scanner.getEdges(connector);
        graphElements.push(...scannerEdges);
      }
    }

    // Generate edges based on IAM Permissions
    for (const scanner of allServices) {
      if (scanner.getIamRoles != null) {
        const resolvedRoles = await scanner.getIamRoles(connector);
        for (const { roleArn, executor } of resolvedRoles) {
          const roleEdges: GraphElement[] = await generateEdgesForRole(
            allServices,
            connector,
            iamStorage,
            roleArn,
            executor,
          );
          graphElements.push(...roleEdges);
        }
      }
    }

    return graphElements;
  }
}

export type { ScanMetadata };
