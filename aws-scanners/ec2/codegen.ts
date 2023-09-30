import generateScanner from "@infrascan/aws-codegen";
import Ec2Scanner from "./config";

generateScanner(Ec2Scanner, {
  overwrite: true,
  basePath: "./src",
}).then(() => console.log("Complete"));
