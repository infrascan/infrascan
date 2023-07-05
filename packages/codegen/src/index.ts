import { Project } from "ts-morph";
import { generateService } from "./services";
import { generateEntrypoint } from "./entrypoint";

import type { ScannerDefinition } from "@infrascan/shared-types";

export function generateScannerImplementations(
  config: ScannerDefinition[],
  basePath: string,
  verbose: boolean
): void {
  try {
    const scannersTsProject = new Project();
    for (let scanner of config) {
      generateService(scannersTsProject, basePath, scanner, verbose);
    }
    generateEntrypoint(scannersTsProject, basePath, config, verbose);
  } catch (err) {
    console.error("Failed to generate scanner implementation:", err);
  }
}
