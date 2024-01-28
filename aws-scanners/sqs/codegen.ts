import generateScanner from "@infrascan/aws-codegen";
import SQSScanner from "./config";

generateScanner(SQSScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
