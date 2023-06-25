import { readFileSync } from "fs";
import { cac } from "cac";
import { Project } from "ts-morph";
import { generateScanner } from "./scanners";
import { generateEntrypoint } from "./entrypoint";

import type { ScannerDefinition } from "./types";
export type {
  ParameterResolver,
  EdgeResolver,
  PaginationToken,
  ServiceGetter,
  ScannerDefinition,
} from "./types";

const cli = cac("infrascan-codegen");
cli
  .command(
    "generate <config>",
    "Generate typescript implementation using the given config file"
  )
  .option("--base-path <path>", "Base path for generated code output")
  .option("-v, --verbose", "Enable verbose output")
  .action((config, options) => {
    try {
      const scannerConfigs = readFileSync(config).toString("utf8");
      const parsedConfig: ScannerDefinition[] = JSON.parse(scannerConfigs);
      const scannersTsProject = new Project();
      const basePath = options.basePath;
      for (let scanner of parsedConfig) {
        generateScanner(scannersTsProject, basePath, scanner, options.verbose);
      }
      generateEntrypoint(
        scannersTsProject,
        basePath,
        parsedConfig,
        options.verbose
      );
    } catch (err) {
      console.error("Failed to generate scanner implementation:", err);
    }
  });

cli.parse();
