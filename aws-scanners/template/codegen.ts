import Scanner from "./config";
import generateScanner from "@infrascan/aws-codegen";

generateScanner(Scanner, {
  overwrite: true,
  basePath: "./src"
}).then(() => console.log('Complete'));