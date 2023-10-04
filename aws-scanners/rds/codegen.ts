import generateScanner from "@infrascan/aws-codegen";
import CloudfrontScanner from "./config";

generateScanner(CloudfrontScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
