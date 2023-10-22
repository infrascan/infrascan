import generateScanner from "@infrascan/aws-codegen";
import S3Scanner from "./config";

generateScanner(S3Scanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
