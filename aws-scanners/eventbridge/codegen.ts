import generateScanner from "@infrascan/aws-codegen";
import EventBridgeScanner from "./config";

generateScanner(EventBridgeScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
