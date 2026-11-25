import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { ScanMetadata } from "@infrascan/sdk";

export const SCAN_METADATA_FILE = "metadata.json";
export const GRAPH_FILE = "graph.json";
export const INFORMATIONAL_GRAPH_FILE = "graph.informational.json";

export function writeScanMetadata(
  outputDirectory: string,
  metadata: ScanMetadata[],
) {
  writeFileSync(
    join(resolve(outputDirectory), SCAN_METADATA_FILE),
    JSON.stringify(metadata),
    "utf8",
  );
}

export function readScanMetadata(outputDirectory: string): ScanMetadata[] {
  const scanMetadata = readFileSync(
    join(resolve(outputDirectory), SCAN_METADATA_FILE),
    "utf8",
  );
  return JSON.parse(scanMetadata);
}

/**
 * Writes graph data into the state directory, returning the path written to.
 */
export function writeGraphOutput<T>(
  outputDirectory: string,
  graphState: T,
  fileName = GRAPH_FILE,
): string {
  const outputPath = join(resolve(outputDirectory), fileName);
  writeFileSync(outputPath, JSON.stringify(graphState));
  return outputPath;
}
