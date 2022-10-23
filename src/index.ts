import * as AWS from 'aws-sdk';
import { DEFAULT_REGION } from './service-config';
import { scanEcsClusters, scanEcsTaskDefinitions } from './ecs';
import { scanLambdas } from './lambda';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

async function scanAwsAccount() {
  const ecsClient = new AWS.ECS();
  const iamClient = new AWS.IAM();
  const lambdaClient = new AWS.Lambda();
  const ecsScanResult = await scanEcsClusters(ecsClient);
  const ecsTasksScanResult = await scanEcsTaskDefinitions(ecsClient, iamClient);
  const lambdaScanResult = await scanLambdas(lambdaClient, iamClient);
  return {
    ecsClusters: ecsScanResult,
    ecsTasks: ecsTasksScanResult,
    lambdas: lambdaScanResult
  };
}

console.log('Beginning Account scan');
scanAwsAccount().then((accountState) => {
  console.log('Account scan succeeded');
  console.log(JSON.stringify(accountState, undefined, 2));
}).catch((err) => {
  console.error('Account scan failed', err);
});