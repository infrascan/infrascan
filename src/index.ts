import * as AWS from 'aws-sdk';
import { DEFAULT_REGION } from './service-config';
import { scanEcsClusters, scanEcsTaskDefinitions } from './ecs';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

async function scanAwsAccount() {
  const ecsClient = new AWS.ECS();
  const iamClient = new AWS.IAM();
  const ecsScanResult = await scanEcsClusters(ecsClient);
  const ecsTasksScanResult = await scanEcsTaskDefinitions(ecsClient, iamClient);
  return {
    ecsClusters: ecsScanResult,
    ecsTasks: ecsTasksScanResult
  };
}

console.log('Beginning ECS scan');
scanAwsAccount().then(() => {
  console.log('ECS scan succeeded');
}).catch((err) => {
  console.error('ECS scan failed', err);
});