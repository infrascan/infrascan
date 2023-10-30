import type {
  ServiceModule,
  Provider,
  Connector,
  GraphElement,
  GraphEdge,
  GraphNode,
} from "@infrascan/shared-types";
import { IAM } from "@aws-sdk/client-iam";
import { IAMStorage, StoredRole, hydrateRoleStorage } from "aws/helpers/iam";
import {
  whoami,
  getAllRegions,
  ScanMetadata,
  scanService,
  CredentialProviderFactory,
  ScanCredentialProvider,
  resolveCredentialsFromProvider,
} from "./scan";

import {
  buildAccountNode,
  buildRegionNode,
  addGraphElementToMap,
  generateEdgesForRole,
} from "./graph";

const AWS_DEFAULT_REGION = "us-east-1";

/* eslint-disable @typescript-eslint/no-explicit-any */
type ScannerRegistry = {
  [service: string]: ServiceModule<any, Provider>;
};

/**
 * Records graph node IDs under the specific service labels to make the latter stages of graph resolution easier
 */
export interface ServiceNodesMap {
  [key: string]: string[];
}

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
    credentialProvider: ScanCredentialProvider,
    connector: Connector,
    opts?: { regions?: string[]; defaultRegion?: string | undefined },
  ): Promise<ScanMetadata> {
    const defaultRegion = opts?.defaultRegion ?? AWS_DEFAULT_REGION;
    const credentials = await resolveCredentialsFromProvider(
      credentialProvider,
      defaultRegion,
    );

    const globalCaller = await whoami(credentials, defaultRegion);
    if (globalCaller?.Account == null) {
      throw new Error(
        "Failed to get caller identity. Please make sure that the credentials provided are correct.",
      );
    }

    const scanMetadata: ScanMetadata = {
      account: globalCaller.Account,
      regions: [],
      defaultRegion,
    };

    const iamClient = new IAM({
      credentials,
      region: defaultRegion,
    });

    const iamStorage = new IAMStorage();

    const scanContext = {
      account: globalCaller.Account,
      region: defaultRegion,
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
      defaultRegion,
      opts?.regions,
    );
    const regionalServiceEntries = Object.entries(this.regionalScannerRegistry);
    for (const region of regionsToScan) {
      scanContext.region = region;
      const regionBoundCredentials = await resolveCredentialsFromProvider(
        credentialProvider,
        region,
      );

      console.log(`Beginning scan of ${region}`);
      for (const [serviceName, serviceScanner] of regionalServiceEntries) {
        console.log(`Beginning scan of ${serviceName} in ${region}`);
        await scanService(
          serviceScanner,
          regionBoundCredentials,
          connector,
          iamStorage,
          iamClient,
          scanContext,
        );
        console.log(`Completed scan of ${serviceName} in ${region}`);
      }
      scanMetadata.regions.push(region);
      console.log(`Completed scan of ${region}`);
    }

    await connector.onServiceScanCompleteCallback(
      scanContext.account,
      defaultRegion,
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
   * const infrascan = new Infrascan();
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
    const serviceNodeMap: ServiceNodesMap = {};

    const iamStorage = new IAMStorage();
    const iamState: StoredRole[] =
      await connector.getGlobalStateForServiceFunction("IAM", "roles");
    hydrateRoleStorage(iamStorage, iamState);

    const graphEdges: Record<string, GraphEdge> = {};
    const graphNodes: Record<string, GraphNode> = {};

    const globalServiceEntries = Object.values(this.globalScannerRegistry);
    const regionalServiceEntries = Object.values(this.regionalScannerRegistry);

    for (const { account, regions, defaultRegion } of scanMetadata) {
      const context = { account, region: defaultRegion };
      const accountNode = buildAccountNode(account);
      addGraphElementToMap(graphNodes, accountNode);

      for (const serviceScanner of globalServiceEntries) {
        if (serviceScanner.getNodes != null) {
          const serviceNodeIds: string[] = [];
          console.log(`Getting Nodes: ${serviceScanner.service}`);
          const scannerNodes = await serviceScanner.getNodes(
            connector,
            context,
          );
          if (serviceScanner.formatNode != null) {
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            const formattedNodes = scannerNodes.map((node) =>
              serviceScanner.formatNode!(node, context),
            );
            formattedNodes.forEach((node) =>
              addGraphElementToMap(graphNodes, node, serviceNodeIds),
            );
          } else {
            scannerNodes.forEach((node) =>
              addGraphElementToMap(graphNodes, node, serviceNodeIds),
            );
          }
          serviceNodeMap[
            serviceScanner.arnLabel ?? serviceScanner.service.toLowerCase()
          ] = serviceNodeIds;
        }
      }

      for (const region of regions) {
        context.region = region;
        const regionNode = buildRegionNode(account, region);
        addGraphElementToMap(graphNodes, regionNode);
        for (const regionalServiceScanner of regionalServiceEntries) {
          if (regionalServiceScanner.getNodes != null) {
            const regionalServiceNodeIds: string[] = [];
            console.log(`Getting Nodes: ${regionalServiceScanner.service}`);
            const regionalNodes = await regionalServiceScanner.getNodes(
              connector,
              context,
            );
            if (regionalServiceScanner.formatNode != null) {
              /* eslint-disable @typescript-eslint/no-non-null-assertion */
              const formattedNodes = regionalNodes.map((node) =>
                regionalServiceScanner.formatNode!(node, context),
              );
              formattedNodes.forEach((node) =>
                addGraphElementToMap(graphNodes, node, regionalServiceNodeIds),
              );
            } else {
              regionalNodes.forEach((node) =>
                addGraphElementToMap(graphNodes, node, regionalServiceNodeIds),
              );
            }
            const serviceNodes =
              serviceNodeMap[
                regionalServiceScanner.arnLabel ??
                  regionalServiceScanner.service.toLowerCase()
              ];
            if (serviceNodes) {
              serviceNodes.push(...regionalServiceNodeIds);
            } else {
              serviceNodeMap[
                regionalServiceScanner.arnLabel ??
                  regionalServiceScanner.service.toLowerCase()
              ] = regionalServiceNodeIds;
            }
          }
        }
      }
    }

    // Edges are generated independent of the scan context to allow for cross-region or cross-account linking
    const allServices = globalServiceEntries.concat(regionalServiceEntries);
    for (const scanner of allServices) {
      if (scanner.getEdges != null) {
        console.log(`Getting Edges: ${scanner.service}`);
        const scannerEdges: GraphEdge[] = await scanner.getEdges(connector);
        scannerEdges.forEach((edge) => addGraphElementToMap(graphEdges, edge));
      }
    }

    // Generate edges based on IAM Permissions
    for (const scanner of allServices) {
      if (scanner.getIamRoles != null) {
        console.log(`Getting Role Edges: ${scanner.service}`);
        const resolvedRoles = await scanner.getIamRoles(connector);
        for (const { roleArn, executor } of resolvedRoles) {
          const roleEdges: GraphEdge[] = await generateEdgesForRole(
            iamStorage,
            roleArn,
            executor,
            serviceNodeMap,
          );
          roleEdges.forEach((edge) => addGraphElementToMap(graphEdges, edge));
        }
      }
    }

    const nodes: GraphElement[] = Object.values(graphNodes);
    const edges: GraphElement[] = Object.values(graphEdges);
    return nodes.concat(edges);
  }
}

export type { ScanMetadata, CredentialProviderFactory, ScanCredentialProvider };
