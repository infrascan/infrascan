import generateScanner from "@infrascan/aws-codegen";
import CloudwatchLogsScanner from "./config";

generateScanner(CloudwatchLogsScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
