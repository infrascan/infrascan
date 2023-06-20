import { readFileSync } from "fs";
import { cac } from "cac";
import { Project } from "ts-morph";
import * as Scanners from "./scanners";
export type {
  ParameterResolver,
  EdgeResolver,
  PaginationToken,
  ServiceGetter,
  ScannerDefinition,
} from "./scanners";

const cli = cac("infrascan-codegen");
cli
  .command(
    "generate <config>",
    "Generate typescript implementation using the given config file"
  )
  .action((config) => {
    try {
      const scannerConfigs = readFileSync(config).toString("utf8");
      const parsedConfig: Scanners.ScannerDefinition[] =
        JSON.parse(scannerConfigs);
      const scannersTsProject = new Project();
      for (let scanner of parsedConfig) {
        Scanners.generateScanner(scannersTsProject, scanner);
      }
    } catch (err) {
      console.error("Failed to generate scanner implementation:", err);
    }
  });

cli.parse();
