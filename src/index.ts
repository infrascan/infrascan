import * as AWS from 'aws-sdk';
import { DEFAULT_REGION } from './service-config';
import { scanEcsClusters, scanEcsTaskDefinitions, EcsCluster } from './ecs';
import { scanLambdas, LambdaFunction } from './lambda';
import { scanTopics, SnsTopic } from './sns';
import { scanQueues, SqsQueue } from './sqs';
import { generateServiceMap } from './graph';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

export interface AccountState {
  clusters: EcsCluster[],
  lambdas: LambdaFunction[],
  topics: SnsTopic[],
  queues: SqsQueue[]
}

async function scanAwsAccount(): Promise<AccountState> {
  const stsClient = new AWS.STS();
  const ecsClient = new AWS.ECS();
  const iamClient = new AWS.IAM();
  const lambdaClient = new AWS.Lambda();
  const snsClient = new AWS.SNS();
  const sqsClient = new AWS.SQS();

  const caller = await stsClient.getCallerIdentity().promise();
  const accountId = caller.Account as string;
  const clusters = await scanEcsClusters(accountId, ecsClient);
  await scanEcsTaskDefinitions(accountId, ecsClient, iamClient);
  const lambdas = await scanLambdas(accountId, lambdaClient, iamClient);
  const topics = await scanTopics(accountId, snsClient);
  const queues = await scanQueues(accountId, sqsClient);
  
  return {
    clusters,
    lambdas,
    topics,
    queues
  }
}

// TODO: Update service scanners to generate edges based on permissions
console.log('Beginning Account scan');
scanAwsAccount().then((accountState) => {
  console.log('Account scan succeeded');
  const formattedBlob = JSON.stringify(accountState, undefined, 2);
  console.log(formattedBlob);
  const graphableData = generateServiceMap(accountState);
  console.log(graphableData);
}).catch((err) => {
  console.error('Account scan failed', err);
});