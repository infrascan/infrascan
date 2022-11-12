import * as AWS from 'aws-sdk';
import { DEFAULT_REGION } from './service-config';
import { scanEcsClusters, scanEcsTaskDefinitions, EcsCluster, EcsTask } from './ecs';
import { scanLambdas, LambdaFunction } from './lambda';
import { scanTopics, SnsTopic } from './sns';
import { scanQueues, SqsQueue } from './sqs';
import { generateServiceMap } from './graph';
import { saveAllScannedRoles, hydrateRoleStorage } from './iam';
import { readStateFromFile, whoami } from './utils';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

export interface AccountState {
  clusters: EcsCluster[],
  ecs: EcsTask[],
  lambda: LambdaFunction[],
  sns: SnsTopic[],
  sqs: SqsQueue[]
}

async function scanAwsAccount(): Promise<AccountState> {
  const ecsClient = new AWS.ECS();
  const iamClient = new AWS.IAM();
  const lambdaClient = new AWS.Lambda();
  const snsClient = new AWS.SNS();
  const sqsClient = new AWS.SQS();

  const caller = await whoami();
  const accountId = caller.Account as string;
  const clusters = await scanEcsClusters(accountId, ecsClient);
  const ecs = await scanEcsTaskDefinitions(accountId, ecsClient, iamClient);
  const lambda = await scanLambdas(accountId, lambdaClient, iamClient);
  const sns = await scanTopics(accountId, snsClient);
  const sqs = await scanQueues(accountId, sqsClient);
  
  saveAllScannedRoles(accountId);

  return {
    clusters,
    lambda,
    ecs,
    sns,
    sqs
  }
}

async function graph() {
  try {
    console.log('Generating service graph');
    const caller = await whoami();
    const accountId = caller.Account as string; 
    
    const clusters = readStateFromFile(accountId, 'ecs-cluster');
    const tasks = readStateFromFile(accountId, 'ecs-tasks');
    const lambda = readStateFromFile(accountId, 'lambda');
    const sns = readStateFromFile(accountId, 'sns');
    const sqs = readStateFromFile(accountId, 'sqs');
    const iam = readStateFromFile(accountId, 'iam');
    hydrateRoleStorage(iam);
    
    console.log('Account state read from fs');
    generateServiceMap({
      clusters,
      ecs: tasks,
      lambda,
      sns,
      sqs
    });
    console.log('Graph generated');
  } catch (err) {
    console.error('Failed to generate graph', { 
      err
    });
  }
}
async function scan() {
  console.log('Beginning Account scan');
  scanAwsAccount().then((accountState) => {
    console.log('Account scan succeeded');
    const formattedBlob = JSON.stringify(accountState, undefined, 2);
    console.log(formattedBlob);
  }).catch((err) => {
    console.error('Account scan failed', err);
  });
}

async function main() {
  const command = process.argv.slice(2);
  if(command.length === 0) {
    console.error('No command given. Use scan to begin a scan of your AWS account, or graph to generate a new infrastructure graph');
    return;
  }
  switch(command[0].toLowerCase()) {
    case "scan":
      return await scan();
    case "graph":
      return await graph();
    default:
      console.error("Unknown command supplied. Currently only graph and scan are supported");
      return;
  }
}
main();