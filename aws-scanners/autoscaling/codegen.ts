import generateScanner from "@infrascan/aws-codegen";
import AutoScalingScanner from "./config";

generateScanner(AutoScalingScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
