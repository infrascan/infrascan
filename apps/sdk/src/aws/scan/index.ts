import * as S3 from "./S3";
import * as CloudFront from "./CloudFront";
import * as Route53 from "./Route53";
import * as Lambda from "./Lambda";
import * as EC2 from "./EC2";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
const GLOBAL_SERVICE_SCANNERS = [S3.performScan, CloudFront.performScan, Route53.performScan];
const REGIONAL_SERVICE_SCANNERS = [Lambda.performScan, EC2.performScan];

export { REGIONAL_SERVICE_SCANNERS, GLOBAL_SERVICE_SCANNERS };