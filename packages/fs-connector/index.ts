import { existsSync } from 'fs';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { filter as buildGlobFilter } from 'minimatch';
import type { Connector, Service } from '@infrascan/shared-types';

type FsError = {
  code?: string;
}

/**
 * Config for the file system resolver.
 */
export type FsResolverConfig = {
  /**
   * Pretty print state when writing to the fs.
   */
  prettyPrint?: boolean;
  /**
   * Force creation of the target directory. Note: this will enable recursive creation.
   */
  createTargetDirectory?: boolean;
};

export const DEFAULT_CONFIG: Required<FsResolverConfig> = {
  prettyPrint: true,
  createTargetDirectory: false
};

async function ensureBasePathExists(absoluteBasePath: string, createTargetDirectory: boolean) {
  const basePathExists = existsSync(absoluteBasePath);
  if(!basePathExists && createTargetDirectory) {
    mkdir(absoluteBasePath, { 
      recursive: true 
    });
  }
}

function buildFilePathForServiceCall(absoluteBasePath: string, account: string, region: string, service: string, functionName: string) {
  return join(absoluteBasePath, `${account}-${region}-${service}-${functionName}.json`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Read and parse state from a file. If the file doesn't exist, treat it as having no state (i.e. return an empty array)
 * @param {string} filePath Path to the state file, typically created during a scan.
 * @returns {any[]} JSON parsed state from the file.
 * @throws {Error} Bubbles up errors from {@link readFile} call
 */
async function readStateFromFile(filePath: string): Promise<any[]> {
  try {
    const state = await readFile(filePath, 'utf8');
    return JSON.parse(state);
  } catch (err) {
    const readError = err as FsError;
    if(readError?.code === 'ENOENT') {
      return [];
    }
    throw err as Error;
  }
}

function serializeState(state: any, prettyPrint: boolean): string {
  if(prettyPrint) {
    return JSON.stringify(state, undefined, 2);
  }
  return JSON.stringify(state);
}

/**
 * Connector to store state in the local file system
 * @param {string} basePath Directory to store Infrascan scan and graph state in
 * @param {FsResolverConfig} config Configuration for the FS Connector
 * @returns {Connector} Infrascan Connector
 * @throws {Error} Errors from readDir, and readFile calls.
 */
export default function buildFsConnector(basePath: string, config: FsResolverConfig = DEFAULT_CONFIG): Connector {
  const resolvedConfig: Required<FsResolverConfig> = Object.assign(DEFAULT_CONFIG, config);
  const absoluteBasePath = resolve(basePath);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function getGlobalStateForServiceFunction(service: string, functionName: string): Promise<any[]> {
    const fileFilter = buildGlobFilter(`*-*-${service}-${functionName}.json`);

    const directoryContents = await readdir(basePath);
    const matchingFileNames = directoryContents.filter((stateFile) => fileFilter(stateFile));

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const allRelevantState: any[][] = await Promise.all(matchingFileNames.map(async (fileName) => readStateFromFile(join(basePath, fileName))));
    return allRelevantState.flatMap((state) => state);
  }

  async function onServiceScanCompleteCallback(
    account: string, 
    region: string, 
    service: Service | 'IAM',
    functionName: string,
    functionState: any
  ): Promise<void> {
    const filePath = buildFilePathForServiceCall(absoluteBasePath, account, region, service, functionName);
    await ensureBasePathExists(absoluteBasePath, resolvedConfig.createTargetDirectory);

    await writeFile(filePath, serializeState(functionState, resolvedConfig.prettyPrint));
  }

  async function resolveStateForServiceFunction(
    account: string, 
    region: string, 
    service: Service, 
    functionName: string
  ): Promise<any> {
    const filePath = buildFilePathForServiceCall(
      absoluteBasePath,
      account,
      region,
      service,
      functionName
    );

    return readStateFromFile(filePath);
  }

  return {
    onServiceScanCompleteCallback,
    resolveStateForServiceFunction,
    getGlobalStateForServiceFunction
  };
}