import generateScanner from "@infrascan/aws-codegen";
import SNSScanner from "./config";

generateScanner(SNSScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
