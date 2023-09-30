import generateScanner from "@infrascan/aws-codegen";
import Route53Scanner from "./config";

generateScanner(Route53Scanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
