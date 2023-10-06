import ApiGateway from "@infrascan/aws-api-gateway-scanner";
import Autoscaling from "@infrascan/aws-autoscaling-scanner";
import Cloudfront from "@infrascan/aws-cloudfront-scanner";
import CloudwatchLogs from "@infrascan/aws-cloudwatch-logs-scanner";
import Dynamodb from "@infrascan/aws-dynamodb-scanner";
import EC2 from "@infrascan/aws-ec2-scanner";
import ECS from "@infrascan/aws-ecs-scanner";
import ElasticLoadBalancing from "@infrascan/aws-elastic-load-balancing-scanner";
import Lambda from "@infrascan/aws-lambda-scanner";
import RDS from "@infrascan/aws-rds-scanner";
import Route53 from "@infrascan/aws-route53-scanner";
import S3 from "@infrascan/aws-s3-scanner";
import SNS from "@infrascan/aws-sns-scanner";
import SQS from "@infrascan/aws-sqs-scanner";

import Infrascan from "@infrascan/sdk";

export function buildInfrascanClient(): Infrascan {
  const infrascan = new Infrascan();
  infrascan.registerScanner(ApiGateway);
  infrascan.registerScanner(Autoscaling);
  infrascan.registerScanner(Cloudfront);
  infrascan.registerScanner(CloudwatchLogs);
  infrascan.registerScanner(Dynamodb);
  infrascan.registerScanner(EC2);
  infrascan.registerScanner(ECS);
  infrascan.registerScanner(ElasticLoadBalancing);
  infrascan.registerScanner(Lambda);
  infrascan.registerScanner(RDS);
  infrascan.registerScanner(Route53);
  infrascan.registerScanner(S3);
  infrascan.registerScanner(SNS);
  infrascan.registerScanner(SQS);
  return infrascan;
}
