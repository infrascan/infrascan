import IamScanner from "./config";
import generateScanner from "@infrascan/aws-codegen";

generateScanner(IamScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
