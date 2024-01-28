import generateScanner from "@infrascan/aws-codegen";
import RDSScanner from "./config";

generateScanner(RDSScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
