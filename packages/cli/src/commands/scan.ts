import { writeFileSync } from "fs";
import { resolve, join } from "path";

import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import buildFsConnector from "@infrascan/fs-connector";
import {
  fromIni,
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";
import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";
import Infrascan from "@infrascan/sdk";
import type { CredentialProviderFactory, ScanMetadata } from "@infrascan/sdk";
import {
  ScanConfig,
  getDefaultRegion,
  resolveScanConfig,
  saveConfig,
} from "../config";
import { LocalStore } from "../store";

/* eslint-disable @typescript-eslint/no-explicit-any */
function writeScanMetadata(outputDirectory: string, metadata: any) {
  writeFileSync(
    join(resolve(outputDirectory), "metadata.json"),
    JSON.stringify(metadata),
    "utf8",
  );
}

function resolveCredentialProvider(
  profile?: string,
  roleToAssume?: string,
): CredentialProviderFactory {
  if (profile) {
    return (region: string) =>
      fromIni({
        profile,
        clientConfig: { region },
      });
  }
  if (roleToAssume) {
    return (region: string) =>
      fromTemporaryCredentials({
        params: {
          RoleArn: roleToAssume,
          RoleSessionName: "infrascan-cli-scan",
        },
        clientConfig: { region },
      });
  }
  console.log(
    "No profile or role given, falling back to default provider chain.",
  );
  return (region: string) =>
    fromNodeProviderChain({ clientConfig: { region } });
}

export default class ScanCmd extends CommandLineAction {
  private _config: CommandLineStringParameter;

  private infrascanClient: Infrascan;

  private _outputDirectory: CommandLineStringParameter;

  private _regions: CommandLineStringListParameter;

  private _saveConfig: CommandLineFlagParameter;

  public constructor(infrascanClient: Infrascan) {
    super({
      actionName: "scan",
      summary: "Scans a set of AWS accounts",
      documentation:
        "Reads in config of accounts, regions and services to scans, and executes a scan against each in turn. The ouput is saved to the local filesystem.",
    });
    this.infrascanClient = infrascanClient;
  }

  protected onDefineParameters(): void {
    this._config = this.defineStringParameter({
      parameterLongName: "--config",
      parameterShortName: "-c",
      argumentName: "PATH_TO_CONFIG",
      description:
        "Config to use for the scan. Defaults to the saved config in the infrascan config directory (see `infrascan state --paths`), if present.",
    });
    this._saveConfig = this.defineFlagParameter({
      parameterLongName: "--save-config",
      description:
        "Save the config given with --config to the infrascan config directory so future scans reuse it.",
    });

    this._outputDirectory = this.defineStringParameter({
      parameterLongName: "--output",
      parameterShortName: "-o",
      argumentName: "PATH_TO_STATE_OUTPUT",
      description:
        "Location to save scan output to. When omitted, the scan is saved as a new snapshot in the local infrascan state directory.",
    });
    this._regions = this.defineStringListParameter({
      parameterLongName: "--region",
      argumentName: "REGION_TO_SCAN",
      description:
        "The region to scan. This flag can be provided many times e.g. --region us-east-1 --region eu-west-1",
    });
  }

  protected async onExecute(): Promise<void> {
    const awsConfig = await loadSharedConfigFiles().catch((err) => {
      console.warn(
        `Failed to load AWS config file, falling back to @infrascan/sdk defaults. (${err.message})`,
      );
      return undefined;
    });

    const defaultRegionFromEnv = getDefaultRegion(awsConfig?.configFile);
    const runtimeRegionsToScan = (
      this._regions.values.length > 0 ? this._regions.values : undefined
    ) as string[] | undefined;

    const { config: scanConfig, source } = resolveScanConfig(
      this._config.value,
      defaultRegionFromEnv,
    );
    console.log(`Using scan config from: ${source}`);
    if (this._saveConfig.value) {
      if (!this._config.value) {
        throw new Error("--save-config requires --config.");
      }
      console.log(`Saved config to: ${await saveConfig(scanConfig)}`);
    }

    const legacyOutput = this._outputDirectory.value;
    if (legacyOutput != null) {
      const connector = buildFsConnector(legacyOutput, {
        createTargetDirectory: true,
      });
      const metadata = await this.scanAccounts(
        scanConfig,
        connector,
        runtimeRegionsToScan,
        awsConfig?.configFile,
      );
      return writeScanMetadata(legacyOutput, metadata);
    }

    const store = await LocalStore.open();
    const snapshot = await store.beginScan(scanConfig);
    console.log(`Recording scan ${snapshot.id} in ${snapshot.path}`);
    try {
      const metadata = await this.scanAccounts(
        scanConfig,
        buildFsConnector(snapshot.path),
        runtimeRegionsToScan,
        awsConfig?.configFile,
      );
      await store.completeScan(snapshot.id, metadata);
    } catch (err) {
      await store.failScan(snapshot.id, err);
      throw err;
    }
    console.log(
      `Scan ${snapshot.id} complete. Run \`infrascan graph\` to graph it.`,
    );
    return undefined;
  }

  private async scanAccounts(
    scanConfig: ScanConfig,
    connector: ReturnType<typeof buildFsConnector>,
    runtimeRegionsToScan: string[] | undefined,
    parsedAwsConfig: Parameters<typeof getDefaultRegion>[0],
  ): Promise<ScanMetadata[]> {
    const metadata: ScanMetadata[] = [];
    for (const accountConfig of scanConfig) {
      // Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
      const {
        profile,
        roleToAssume,
        regions,
        defaultRegion: configDefaultRegion,
      } = accountConfig;

      const credentials = resolveCredentialProvider(profile, roleToAssume);

      const defaultRegion =
        configDefaultRegion ?? getDefaultRegion(parsedAwsConfig, profile);
      const accountMetadata = await this.infrascanClient.performScan(
        credentials,
        connector,
        { regions: runtimeRegionsToScan ?? regions, defaultRegion },
      );
      metadata.push(accountMetadata);
    }
    return metadata;
  }
}
