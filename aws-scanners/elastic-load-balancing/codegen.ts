import generateScanner from "@infrascan/aws-codegen";
import ElasticLoadBalancingScanner from "./config";

generateScanner(ElasticLoadBalancingScanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
