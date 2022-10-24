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
  console.log('Begin ECS Clusters Scan');
  const ecsScanResult = await scanEcsClusters(ecsClient);
  console.log('End ECS Clusters Scan');
  console.log('Begin ECS Tasks Scan');
  const ecsTasksScanResult = await scanEcsTaskDefinitions(ecsClient, iamClient);
  console.log('End ECS Tasks Scan');
  console.log('Begin Lambdas Scan');
  const lambdaScanResult = await scanLambdas(lambdaClient, iamClient);
  console.log('End Lambdas Scan');
  console.log('Begin SNS Scan');
  const snsScanResult = await scanTopics(snsClient);
  console.log('End SNS Scan');
  console.log('Begin SQS Scan');
  const sqsScanResult = await scanQueues(sqsClient);
  console.log('End SQS Scan');
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