import KinesisScanner from "./config";
import generateScanner from "@infrascan/aws-codegen";

generateScanner(KinesisScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
