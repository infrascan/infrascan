import { Project } from "ts-morph";
import { generateService } from "./services";
import { generateEntrypoint } from "./entrypoint";

import type { ScannerDefinition } from "@infrascan/shared-types";

export function generateScannerImplementations(
  config: ScannerDefinition[],
  basePath: string,
  overwrite: boolean,
  verbose: boolean
): void {
  try {
    const scannersTsProject = new Project();
    for (let scanner of config) {
      generateService(scannersTsProject, basePath, scanner, overwrite, verbose);
    }
    generateEntrypoint(scannersTsProject, basePath, config, overwrite, verbose);
  } catch (err) {
    console.error("Failed to generate scanner implementation:", err);
  }
}
