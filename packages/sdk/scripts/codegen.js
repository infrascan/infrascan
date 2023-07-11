const { generateScannerImplementations } = require("@infrascan/codegen");
const InfrascanScanners = require("@infrascan/config").default;

const verboseLogging = process.env.VERBOSE === "1";
generateScannerImplementations(
  InfrascanScanners,
  "./src/aws/services",
  true,
  verboseLogging
);
