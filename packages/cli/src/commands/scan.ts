import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import {
  CommandLineAction,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import buildFsConnector from "@infrascan/fs-connector";
import {
  fromIni,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import Infrascan from "@infrascan/sdk";

function getConfig(path: string) {
  const resolvedConfigPath = resolve(path);
  return JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function writeScanMetadata(outputDirectory: string, metadata: any) {
  writeFileSync(
    join(resolve(outputDirectory), "metadata.json"),
    JSON.stringify(metadata),
    "utf8",
  );
}

function resolveCredentials(
  profile?: string,
  roleToAssume?: string,
): AwsCredentialIdentityProvider {
  if (profile) {
    return fromIni({
      profile,
    });
  }
  if (roleToAssume) {
    return fromTemporaryCredentials({
      params: {
        RoleArn: roleToAssume,
        RoleSessionName: "infrascan-cli-scan",
      },
      clientConfig: { region: undefined },
    });
  }
  throw new Error(
    "An error occurred while resolving credentials for Infrascan — no profile or role given.",
  );
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
      defaultValue: "./config.json",
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
    const scanConfig = getConfig(this._config.value as string);
    const connector = buildFsConnector(this._outputDirectory.value as string, {
      createTargetDirectory: true,
    });

    const metadata = [];
    for (const accountConfig of scanConfig) {
      // Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
      const { profile, roleToAssume, regions } = accountConfig;
      const credentials = resolveCredentials(profile, roleToAssume);
      const accountMetadata = await this.infrascanClient.performScan(
        credentials,
        connector,
        { regions },
      );
      metadata.push(accountMetadata);
    }
    return writeScanMetadata(this._outputDirectory.value as string, metadata);
  }
}
