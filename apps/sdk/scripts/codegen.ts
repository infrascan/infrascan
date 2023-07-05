import { generateScannerImplementations } from "@infrascan/codegen";
import InfrascanScanners from "@infrascan/config";

const verboseLogging = process.env.VERBOSE === "1";
const overwrite = process.env.OVERWRITE === "1";
generateScannerImplementations(
  InfrascanScanners,
  "./src/aws/services",
  overwrite,
  verboseLogging
);
