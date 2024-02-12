import { writeFileSync } from "fs";
import { resolve, join } from "path";

import {
  CommandLineAction,
  CommandLineStringListParameter,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import buildFsConnector from "@infrascan/fs-connector";
import {
  fromIni,
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";
import {
  loadSharedConfigFiles,
} from "@smithy/shared-ini-file-loader";
import Infrascan from "@infrascan/sdk";
import type { CredentialProviderFactory } from "@infrascan/sdk";
import { ScanConfig, getConfig, getDefaultRegion } from "../config";

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
      description: "Config to use for the scan.",
    });

    this._outputDirectory = this.defineStringParameter({
      parameterLongName: "--output",
      parameterShortName: "-o",
      argumentName: "PATH_TO_STATE_OUTPUT",
      description: "Location to save scan output to.",
      defaultValue: "./state",
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
    const runtimeRegionsToScan =
      this._regions.values.length > 0 ? this._regions.values : undefined;

    const scanConfig = this._config.value
      ? getConfig(this._config.value)
      : ([
        {
          defaultRegion: defaultRegionFromEnv,
        },
      ] as ScanConfig);

    const connector = buildFsConnector(this._outputDirectory.value as string, {
      createTargetDirectory: true,
    });

    const metadata = [];
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
        configDefaultRegion ?? getDefaultRegion(awsConfig?.configFile, profile);
      const accountMetadata = await this.infrascanClient.performScan(
        credentials,
        connector,
        { regions: runtimeRegionsToScan ?? regions, defaultRegion },
      );
      metadata.push(accountMetadata);
    }
    return writeScanMetadata(this._outputDirectory.value as string, metadata);
  }
}
