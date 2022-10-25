import { EcsCluster } from './ecs';
import { LambdaFunction } from './lambda';
import { SnsTopic } from './sns';
import { SqsQueue } from './sqs';
import { AccountState } from './index';

const BASE_PATH = './assets/aws/Architecture-Service-Icons';
const ICON_SIZE = '32';
const SERVICE_ICONS: any = {
  // TODO: be more specific, account for sub-service resources
  ECS: `${BASE_PATH}/Arch_Containers/${ICON_SIZE}/Arch_Amazon-Elastic-Container-Service_32.svg`, 
  Lambda: `${BASE_PATH}/Arch_Compute/${ICON_SIZE}/Arch_AWS-Lambda_32.svg`,
  SNS: `${BASE_PATH}/Arch_App-Integration/${ICON_SIZE}/Arch_Amazon-Simple-Notification-Service_32.svg`,
  SQS: `${BASE_PATH}/Arch_App-Integration/${ICON_SIZE}/Arch_Amazon-Simple-Queue-Service_32.svg`,
};

// TODO: use cytoscape style w selectors to add svgs to nodes
// This function should only generate the hierarchies
export function generateServiceMap(accountState: AccountState) {
  return Object.values(accountState).map((resourceCollection) => {
    const resourceKey = resourceCollection.ResourceKey as string;
    const icon = SERVICE_ICONS[resourceKey];
    return resourceCollection.map((resource: any) => ({
      id: resource.Arn,
      src: icon,
    }));
  });
}