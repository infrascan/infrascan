import { ContainerInstance, DescribeContainerInstancesCommandOutput, ListContainerInstancesCommandOutput } from "@aws-sdk/client-ecs";
import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  GraphNode,
  State,
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
  state.push(...DescribeClustersNodes);
  const DescribeServicesNodes = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:`"ECS-Service"`,rawState:@}',
    stateConnector,
  );
  state.push(...DescribeServicesNodes);
  const DescribeServicesNodes2 = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:`"ECS-Task"`,rawState:@}',
    stateConnector,
  );
  state.push(...DescribeServicesNodes2);
  const DescribeTasksNodes = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`"ECS-Task"`,rawState:@}',
    stateConnector,
  );
  state.push(...DescribeTasksNodes);

  const ListContainerInstancesState: State<ListContainerInstancesCommandOutput>[] = await evaluateSelector(
    context.account,
    context.region,
    'ECS|ListContainerInstances|[]',
    stateConnector,
  );

  const containerInstanceToClusterMap = ListContainerInstancesState.reduce<Record<string, string>>((acc, { _parameters, _result }) => {
    _result.containerInstanceArns?.forEach((containerInstance) => {
      acc[containerInstance] = _parameters.cluster;
    });
    return acc;
  }, {});


  const DescribeContainerInstancesState: ContainerInstance[] = await evaluateSelector(
    context.account,
    context.region,
    'ECS|DescribeContainerInstances|[]._result.containerInstances[]',
    stateConnector,
  );

  const DescribeContainerInstancesNodes = DescribeContainerInstancesState.filter((containerInstance) => containerInstance.containerInstanceArn != null).map((containerInstance) => {
    const cluster = containerInstanceToClusterMap[containerInstance.containerInstanceArn as string];
    if (cluster == null) {
      console.warn("No cluster found for ECS Container Instance:", containerInstance.containerInstanceArn);
    }
    return {
      id: containerInstance.containerInstanceArn as string,
      parent: cluster,
      type: "ECS-Container",
      rawState: containerInstance,
      name: containerInstance.ec2InstanceId
    };
  });
  state.push(...DescribeContainerInstancesNodes);

  return state.map((node) => formatNode(node, "ecs", "ECS", context, true));
}
