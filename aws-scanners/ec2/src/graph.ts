import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  AwsContext,
  Connector,
  GraphNode,
  SelectedNode,
} from "@infrascan/shared-types";
import type {
  Subnet,
  Vpc,
} from "@aws-sdk/client-ec2";


export async function getNodes(
  connector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const ec2NetworkingNodes: GraphNode[] = [];
  const vpcs: Vpc[] = await evaluateSelector(
    context.account,
    context.region,
    "EC2|DescribeVpcs|[]._result.Vpcs[]",
    connector,
  );
  const rawVpcNodes: SelectedNode[] = vpcs.flatMap(({ VpcId, ...vpcInfo }) => ({
    name: VpcId,
    id: VpcId as string,
    type: "EC2-VPC",
    parent: `${context.account}-${context.region}`,
    rawState: vpcInfo,
  })) ?? [];

  const vpcNodes = rawVpcNodes.map((node) => formatNode(node, 'EC2', 'EC2-VPC', context, true));
  ec2NetworkingNodes.push(...vpcNodes);

  /**
   * Main complication with EC2 Networking: Availability Zones have to be forced into
   * VPCs despite not being modelled that way by AWS. This is because VPCs span many AZs,
   * in which subnets exist. So a hierarchy of Region > VPC > AZ > Subnet is the _most_ correct.
   */
  const subnetsState: Subnet[] = await evaluateSelector(
    context.account,
    context.region,
    "EC2|DescribeSubnets|[]._result.Subnets[]",
    connector,
  );

  const rawAzNodes: SelectedNode[] = subnetsState.flatMap(({ AvailabilityZone, VpcId }) => ({
    id: `${VpcId}-${AvailabilityZone}`,
    type: "EC2-VPC-AZ",
    parent: VpcId,
    name: AvailabilityZone,
  })) ?? [];

  const azNodes = rawAzNodes.map((node) => formatNode(node, 'EC2', 'EC2-VPC-AZ', context, true));
  ec2NetworkingNodes.push(...azNodes);

  const rawSubnets: SelectedNode[] = subnetsState.flatMap(({ VpcId, SubnetId, AvailabilityZone, ...subnetState }) => ({
    id: SubnetId as string,
    type: "EC2-Subnet",
    parent: `${VpcId}-${AvailabilityZone}`,
    name: SubnetId,
    rawState: subnetState
  })) ?? [];

  const subnetNodes = rawSubnets.map((node) => formatNode(node, 'EC2', 'EC2-Subnet', context, true));
  ec2NetworkingNodes.push(...subnetNodes);

  return ec2NetworkingNodes;
}
