import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { CommandLineAction, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { performScan } from "@infrascan/sdk";
import buildFsConnector from '@infrascan/fs-connector';
import {
  fromIni,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";

import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';

function getConfig(path: string) {
  const resolvedConfigPath = resolve(path);
  return JSON.parse(readFileSync(resolvedConfigPath, 'utf8'));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function writeScanMetadata(outputDirectory: string, metadata: any) {
  writeFileSync(
    join(resolve(outputDirectory), 'metadata.json'), 
    JSON.stringify(metadata), 
    'utf8'
  );
}

function resolveCredentials(profile?: string, roleToAssume?: string): AwsCredentialIdentityProvider {
  if (profile) {
    return fromIni({
      profile,
    });
  } if (roleToAssume) {
    return fromTemporaryCredentials({
      params: {
        RoleArn: roleToAssume,
        RoleSessionName: "infrascan-cli-scan",
      },
    });
  } 
    throw new Error();
}

export default class ScanCmd extends CommandLineAction {
  private _config: CommandLineStringParameter;

  private _outputDirectory: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'scan',
      summary: 'Scans a set of AWS accounts',
      documentation: 'Reads in config of accounts, regions and services to scans, and executes a scan against each in turn. The ouput is saved to the local filesystem.'
    });
  }

  protected onDefineParameters(): void {
    this._config = this.defineStringParameter({
      parameterLongName: '--config',
      parameterShortName: '-c',
      argumentName: 'PATH_TO_CONFIG',
      description: 'Config to use for the scan.',
      defaultValue: './config.json'
    });

    this._outputDirectory = this.defineStringParameter({
      parameterLongName: '--output',
      parameterShortName: '-o',
      argumentName: 'PATH_TO_STATE_OUTPUT',
      description: 'Location to save scan output to.',
      defaultValue: './state'
    });
  }

  protected async onExecute(): Promise<void> {
    const scanConfig = getConfig(this._config.value as string);
    const { 
      onServiceScanCompleteCallback, 
      resolveStateForServiceFunction,
    } = buildFsConnector(this._outputDirectory.value as string, { 
      createTargetDirectory: true 
    });
    
    const metadata = [];
    for (const accountConfig of scanConfig) {
      // Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
      const { profile, roleToAssume, regions, services } = accountConfig;
      const credentials = resolveCredentials(profile, roleToAssume);
      const accountMetadata = await performScan({
        credentials,
        regions,
        services,
        onServiceScanComplete: onServiceScanCompleteCallback,
        resolveStateForServiceCall: resolveStateForServiceFunction,
      });
      metadata.push(accountMetadata);
    }
    return writeScanMetadata(this._outputDirectory.value as string, metadata);
  }
}