import generateScanner from "@infrascan/aws-codegen";
import ApiGatewayScanner from "./config";

generateScanner(ApiGatewayScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
