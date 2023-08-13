import { Project } from 'ts-morph';
import type { BaseScannerDefinition } from '@infrascan/shared-types';

import { generateService } from './services';
import { generateEntrypoint } from './entrypoint';


export function generateScannerImplementations(
  config: BaseScannerDefinition[],
  basePath: string,
  overwrite: boolean,
  verbose: boolean,
): void {
  try {
    const scannersTsProject = new Project();
    config.forEach((scanner) => {
      generateService(scannersTsProject, basePath, scanner, overwrite, verbose);
    });
    generateEntrypoint(scannersTsProject, basePath, config, overwrite, verbose);
  } catch (err) {
    console.error('Failed to generate scanner implementation:', err);
  }
}
