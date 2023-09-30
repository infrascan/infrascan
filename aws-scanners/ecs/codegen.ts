import generateScanner from "@infrascan/aws-codegen";
import ECSScanner from "./config";

generateScanner(ECSScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
