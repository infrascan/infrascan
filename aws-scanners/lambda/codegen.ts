import LambdaScanner from "./config";
import generateScanner from "@infrascan/aws-codegen";

generateScanner(LambdaScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
