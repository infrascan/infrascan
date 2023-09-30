import generateScanner from "@infrascan/aws-codegen";
import DynamoDB from "./config";

generateScanner(DynamoDB, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
