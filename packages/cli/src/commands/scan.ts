import { writeFileSync } from "fs";
import { resolve, join } from "path";

import {
  CommandLineAction,
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
  DEFAULT_PROFILE,
} from "@smithy/shared-ini-file-loader";
import Infrascan from "@infrascan/sdk";
import type { CredentialProviderFactory } from "@infrascan/sdk";
import { getConfig, getDefaultConfig } from "../config";

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
  }

  protected async onExecute(): Promise<void> {
    const awsConfig = await loadSharedConfigFiles().catch((err) => {
      console.warn(
        `Failed to load AWS config file, falling back to @infrascan/sdk defaults. (${err.message})`,
      );
      return undefined;
    });
    const scanConfig = this._config.value
      ? getConfig(this._config.value)
      : getDefaultConfig(awsConfig?.configFile);

    const connector = buildFsConnector(this._outputDirectory.value as string, {
      createTargetDirectory: true,
    });

    const metadata = [];
    for (const accountConfig of scanConfig) {
      // Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
      const { profile, roleToAssume, regions } = accountConfig;
      const credentials = resolveCredentialProvider(profile, roleToAssume);

      const defaultRegion =
        awsConfig?.configFile?.[profile ?? DEFAULT_PROFILE]?.region;
      const accountMetadata = await this.infrascanClient.performScan(
        credentials,
        connector,
        { regions, defaultRegion },
      );
      metadata.push(accountMetadata);
    }
    return writeScanMetadata(this._outputDirectory.value as string, metadata);
  }
}
