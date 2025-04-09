import { renderFile } from "ejs";
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BaseScannerDefinition } from "@infrascan/shared-types";

export type CodegenConfig = {
  basePath: string;
  overwrite: boolean;
};

export default async function generateScanner(
  scannerDefinition: BaseScannerDefinition,
  config: CodegenConfig,
) {
  const generatedFilesBasePath = join(config.basePath, "generated");
  if (!existsSync(generatedFilesBasePath)) {
    await mkdir(generatedFilesBasePath);
  }

  const targetPath = join(config.basePath, "generated/getters.ts");
  if (existsSync(targetPath) && !config.overwrite) {
    console.warn(
      targetPath,
      " already exists. Pass overwrite: true in the codegen config to update it in place.",
    );
  } else {
    const renderedScanner = await renderFile(
      join(__dirname, "./templates/service-scanner.ts.ejs"),
      scannerDefinition,
    );
    await writeFile(targetPath, renderedScanner);
  }

  if (!scannerDefinition.skipClientBuilder) {
    const clientTargetPath = join(config.basePath, "generated/client.ts");
    if (existsSync(clientTargetPath) && !config.overwrite) {
      console.warn(
        clientTargetPath,
        " already exists. Pass overwrite: true in the codegen config to update it in place.",
      );
    } else {
      const renderedClientBuilder = await renderFile(
        join(__dirname, "./templates/client-builder.ts.ejs"),
        scannerDefinition,
      );
      await writeFile(clientTargetPath, renderedClientBuilder);
    }
  }

  if (scannerDefinition.edges != null) {
    const graphTargetPath = join(config.basePath, "generated/graph.ts");
    if (existsSync(graphTargetPath) && !config.overwrite) {
      console.warn(
        graphTargetPath,
        " already exists. Pass overwrite: true in the codegen config to update it in place.",
      );
    } else {
      const renderedGraphSelector = await renderFile(
        join(__dirname, "./templates/graph-selector.ts.ejs"),
        scannerDefinition,
      );
      await writeFile(graphTargetPath, renderedGraphSelector);
    }
  }

  const suggestedExport = await renderFile(
    join(__dirname, "./templates/module-export.ts.ejs"),
    scannerDefinition,
  );
  console.log(
    "The expected export for this scanner is below. It should, at a minimum, serve as a strong starting point.",
  );
  console.log("-----BEGIN EXPECTED EXPORT-----");
  console.log(suggestedExport);
  console.log("-----END EXPECTED EXPORT-----");
}
