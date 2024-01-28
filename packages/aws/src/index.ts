import type Infrascan from "@infrascan/sdk";
import ApiGatewayScanner from "@infrascan/aws-api-gateway-scanner";
import AutoscalingScanner from "@infrascan/aws-autoscaling-scanner";
import CloudfrontScanner from "@infrascan/aws-cloudfront-scanner";
import CloudwatchLogsScanner from "@infrascan/aws-cloudwatch-logs-scanner";
import DynamoDBScanner from "@infrascan/aws-dynamodb-scanner";
import Ec2Scanner from "@infrascan/aws-ec2-scanner";
import ECSScanner from "@infrascan/aws-ecs-scanner";
import ElasticLoadBalancingScanner from "@infrascan/aws-elastic-load-balancing-scanner";
import KinesisScanner from "@infrascan/aws-kinesis-scanner";
import LambdaScanner from "@infrascan/aws-lambda-scanner";
import RDSScanner from "@infrascan/aws-rds-scanner";
import Route53Scanner from "@infrascan/aws-route53-scanner";
import S3Scanner from "@infrascan/aws-s3-scanner";
import SNSScanner from "@infrascan/aws-sns-scanner";
import SFNScanner from "@infrascan/aws-step-function-scanner";
import SQSScanner from "@infrascan/aws-sqs-scanner";

export function registerAwsScanners(infrascanClient: Infrascan): Infrascan {
  infrascanClient.registerScanner(ApiGatewayScanner);
  infrascanClient.registerScanner(AutoscalingScanner);
  infrascanClient.registerScanner(CloudfrontScanner);
  infrascanClient.registerScanner(CloudwatchLogsScanner);
  infrascanClient.registerScanner(DynamoDBScanner);
  infrascanClient.registerScanner(Ec2Scanner);
  infrascanClient.registerScanner(ECSScanner);
  infrascanClient.registerScanner(ElasticLoadBalancingScanner);
  infrascanClient.registerScanner(KinesisScanner);
  infrascanClient.registerScanner(LambdaScanner);
  infrascanClient.registerScanner(RDSScanner);
  infrascanClient.registerScanner(Route53Scanner);
  infrascanClient.registerScanner(S3Scanner);
  infrascanClient.registerScanner(SNSScanner);
  infrascanClient.registerScanner(SFNScanner);
  infrascanClient.registerScanner(SQSScanner);
  return infrascanClient;
}
