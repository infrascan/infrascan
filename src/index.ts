import * as AWS from 'aws-sdk';
import { writeFileSync } from 'fs';
import { DEFAULT_REGION } from './service-config';
import { scanEcsClusters, scanEcsTaskDefinitions } from './ecs';
import { scanLambdas } from './lambda';
import { scanTopics } from './sns';
import { scanQueues } from './sqs';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

async function scanAwsAccount() {
  const ecsClient = new AWS.ECS();
  const iamClient = new AWS.IAM();
  const lambdaClient = new AWS.Lambda();
  const snsClient = new AWS.SNS();
  const sqsClient = new AWS.SQS();
  const ecsScanResult = await scanEcsClusters(ecsClient);
  const ecsTasksScanResult = await scanEcsTaskDefinitions(ecsClient, iamClient);
  const lambdaScanResult = await scanLambdas(lambdaClient, iamClient);
  const snsScanResult = await scanTopics(snsClient);
  const sqsScanResult = await scanQueues(sqsClient);
  return {
    ecsClusters: ecsScanResult,
    ecsTasks: ecsTasksScanResult,
    lambdas: lambdaScanResult,
    sns: snsScanResult,
    sqs: sqsScanResult
  };
}

console.log('Beginning Account scan');
scanAwsAccount().then((accountState) => {
  console.log('Account scan succeeded');
  const formattedBlob = JSON.stringify(accountState, undefined, 2);
  console.log(formattedBlob);

  if(process.env.OUTPUT_FILE) {
    writeFileSync(process.env.OUTPUT_FILE, formattedBlob);
  }

}).catch((err) => {
  console.error('Account scan failed', err);
});