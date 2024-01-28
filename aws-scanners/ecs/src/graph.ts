import { Service } from "@aws-sdk/client-ecs";
import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  GraphNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const state: SelectedNode[] = [];

  const DescribeClustersNodes = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:`"ECS-Cluster"`,rawState:@}',
    stateConnector,
  );
  const clusterMap = DescribeClustersNodes.reduce<Record<string, SelectedNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});

  const rawServicesState: Service[] = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeServices|[]._result.services | []',
    stateConnector,
  );

  // If the service is running in awsvpc mode, we have to create a child node per VPC Subnet
  // To retain the logical grouping under a cluster, we also duplicate the clusters into the subnet where relevant.
  const subnetClusterNodeMap: Record<string, SelectedNode> = {};
  const serviceNodes: SelectedNode[] = rawServicesState.flatMap((service) => {
    const defaultServiceNode = {
      id: service.serviceArn as string,
      parent: service.clusterArn,
      name: service.serviceName,
      type: 'ECS-Service',
      rawState: service
    };
    if (service.networkConfiguration?.awsvpcConfiguration?.subnets != null) {
      return service.networkConfiguration.awsvpcConfiguration.subnets.map((subnet) => {
        const parentId = `${subnet}-${service.clusterArn}`;
        if (subnetClusterNodeMap[parentId] == null) {
          subnetClusterNodeMap[parentId] = {
            ...clusterMap[service.clusterArn!],
            id: parentId,
            parent: subnet
          };
        }
        return {
          ...defaultServiceNode,
          parent: parentId,
          id: `${subnet}-${service.serviceArn}`
        }
      });
    }
    return defaultServiceNode;
  });

  state.push(...serviceNodes);
  state.push(...Object.values(subnetClusterNodeMap));

  // If the service is running in awsvpc mode, the tasks need to be created as children of each Service node
  const serviceTaskNodes = rawServicesState.flatMap((service) => {
    const defaultServiceTaskNode = {
      id: service.taskDefinition as string,
      parent: service.serviceArn,
      type: 'ECS-Task',
      rawState: service
    };
    if (service.networkConfiguration?.awsvpcConfiguration?.subnets != null) {
      return service.networkConfiguration.awsvpcConfiguration.subnets.map((subnet) => ({
        ...defaultServiceTaskNode,
        parent: `${subnet}-${service.serviceArn}`,
        id: `${subnet}-${service.taskDefinition}`
      }));
    }
    return defaultServiceTaskNode;
  });
  state.push(...serviceTaskNodes);

  const rawDescribeTasksNodes = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`"ECS-Task"`,rawState:@}',
    stateConnector,
  );
  const DescribeTasksNodes = rawDescribeTasksNodes.filter((node) => {
    return !node.rawState?.group?.startsWith('service:');
  }).map((node) => {
    const taskDefName = node.id.split('/').pop();
    return {
      ...node,
      name: taskDefName.slice(0, taskDefName.indexOf(':'))
    }
  });
  state.push(...DescribeTasksNodes);

  // Do not create clusters at the region level if there are no children (i.e. all children exist under VPCs)
  const clustersWithChildren = DescribeClustersNodes.filter((clusterNode) => DescribeTasksNodes.find((node) => node.parent === clusterNode.id) != null);
  if (clustersWithChildren.length > 0) {
    state.push(...clustersWithChildren);
  }

  return state.map((node) => formatNode(node, "ecs", "ECS", context, true));
}