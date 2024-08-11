import type {
  ServiceModule,
  Provider,
  Connector,
  GraphPluginEvents,
  GraphPlugin,
  GraphSerializer,
  SelectedEdge,
} from "@infrascan/shared-types";
import { Graph } from "@infrascan/core";
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
  AWS_ACCOUNT_SERVICE_KEY,
  AWS_REGION_SERVICE_KEY,
  addEdgeToGraphUnchecked,
  addNodeToGraphUnchecked,
  buildAccountNode,
  buildRegionNode,
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

  private pluginRegistry: {
    [E in GraphPluginEvents]: Omit<GraphPlugin<E>, "event">[];
  };

  constructor() {
    this.regionalScannerRegistry = {};
    this.globalScannerRegistry = {};
    this.pluginRegistry = {
      onAccountComplete: [],
      onGraphComplete: [],
      onRegionComplete: [],
      onServiceComplete: [],
    };
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
   * Register a plugin to be run during the lifecycle of the graph. Supported events are {@link GraphPluginEvents}.
   * Plugins registered for the same event will be run in order of registration.
   * @param plugin A plugin to be run on a specified lifecycle event within the graph.
   */
  registerPlugin<E extends GraphPluginEvents>(plugin: GraphPlugin<E>) {
    const { event, ...pluginDetails } = plugin;
    this.pluginRegistry[event].push(pluginDetails);
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
   *  connector,
   *  (graph) => graph.nodes()
   * ).then(function (graphData) {
   *  console.log("Graph Complete!", graphData);
   * }).catch(function (err) {
   *  console.error("Failed to create graph", err);
   * });
   * ```
   */
  async generateGraph<T>(
    scanMetadata: ScanMetadata | ScanMetadata[],
    connector: Connector,
    graphSerializer: GraphSerializer<T>,
  ): Promise<T> {
    const serviceNodeMap: ServiceNodesMap = {};
    const graph = Graph();

    const iamStorage = new IAMStorage();
    const iamState: StoredRole[] =
      await connector.getGlobalStateForServiceFunction("IAM", "roles");
    hydrateRoleStorage(iamStorage, iamState);

    const globalServiceEntries = Object.values(this.globalScannerRegistry);
    const regionalServiceEntries = Object.values(this.regionalScannerRegistry);

    const metadataList = Array.isArray(scanMetadata)
      ? scanMetadata
      : [scanMetadata];
    for (const { account, regions, defaultRegion } of metadataList) {
      const context = { account, region: defaultRegion };
      const accountNode = buildAccountNode(account);
      addNodeToGraphUnchecked(graph, accountNode, AWS_ACCOUNT_SERVICE_KEY);

      for (const serviceScanner of globalServiceEntries) {
        if (serviceScanner.getNodes != null) {
          const serviceNodeIds: string[] = [];
          console.log(`Getting Nodes: ${serviceScanner.service}`);
          const scannerNodes = await serviceScanner.getNodes(
            connector,
            context,
          );
          scannerNodes.forEach((node) => {
            addNodeToGraphUnchecked(graph, node, serviceScanner.service);
            serviceNodeIds.push(node.id);
          });
          serviceNodeMap[
            serviceScanner.arnLabel ?? serviceScanner.service.toLowerCase()
          ] = serviceNodeIds;
          for (const { id, handler } of this.pluginRegistry.onServiceComplete) {
            console.log(`Running ${id} onServiceComplete`);
            await handler(graph, serviceScanner.service, context);
          }
        }
      }

      for (const region of regions) {
        context.region = region;
        const regionNode = buildRegionNode(account, region);
        addNodeToGraphUnchecked(graph, regionNode, AWS_REGION_SERVICE_KEY);
        for (const regionalServiceScanner of regionalServiceEntries) {
          if (regionalServiceScanner.getNodes != null) {
            const regionalServiceNodeIds: string[] = [];
            console.log(`Getting Nodes: ${regionalServiceScanner.service}`);
            const regionalNodes = await regionalServiceScanner.getNodes(
              connector,
              context,
            );
            regionalNodes.forEach((node) => {
              addNodeToGraphUnchecked(
                graph,
                node,
                regionalServiceScanner.service,
              );
              regionalServiceNodeIds.push(node.id);
            });
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

            for (const { id, handler } of this.pluginRegistry
              .onServiceComplete) {
              console.log(`Running ${id} onServiceComplete`);
              await handler(graph, regionalServiceScanner.service, context);
            }
          }
        }

        for (const { id, handler } of this.pluginRegistry.onRegionComplete) {
          console.log(`Running ${id} onRegionComplete`);
          await handler(graph, context);
        }
      }

      for (const { id, handler } of this.pluginRegistry.onAccountComplete) {
        console.log(`Running ${id} onAccountComplete`);
        await handler(graph, context);
      }
    }

    // Edges are generated independent of the scan context to allow for cross-region or cross-account linking
    const allServices = globalServiceEntries.concat(regionalServiceEntries);
    for (const scanner of allServices) {
      if (scanner.getEdges != null) {
        console.log(`Getting Edges: ${scanner.service}`);
        const scannerEdges: SelectedEdge[] = await scanner.getEdges(connector);
        scannerEdges.forEach((edge) => addEdgeToGraphUnchecked(graph, edge));
      }
    }

    // Generate edges based on IAM Permissions
    for (const scanner of allServices) {
      if (scanner.getIamRoles != null) {
        console.log(`Getting Role Edges: ${scanner.service}`);
        const resolvedRoles = await scanner.getIamRoles(connector);
        for (const { roleArn, executor } of resolvedRoles) {
          const roleEdges: SelectedEdge[] = await generateEdgesForRole(
            iamStorage,
            roleArn,
            executor,
            serviceNodeMap,
          );
          roleEdges.forEach((edge) => addEdgeToGraphUnchecked(graph, edge));
        }
      }
    }

    for (const { id, handler } of this.pluginRegistry.onGraphComplete) {
      console.log(`Running ${id} onGraphComplete`);
      await handler(graph);
    }

    return graphSerializer(graph);
  }
}

export type { ScanMetadata, CredentialProviderFactory, ScanCredentialProvider };
