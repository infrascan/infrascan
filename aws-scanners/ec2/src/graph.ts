import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  Connector,
  GraphNode,
  State,
} from "@infrascan/shared-types";
import type {
  DescribeSubnetsCommandOutput,
  DescribeVpcsCommandOutput,
  Subnet,
} from "@aws-sdk/client-ec2";


export async function getNodes(
  connector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const ec2NetworkingNodes: GraphNode[] = [];
  const vpcs: State<DescribeVpcsCommandOutput>[] = await evaluateSelector(
    context.account,
    context.region,
    "EC2|DescribeVpcs|[]",
    connector,
  );
  const vpcNodes: GraphNode[] = vpcs.flatMap(({ _metadata, _result }) =>
    _result.Vpcs?.map(({ VpcId, ...vpcInfo }) => ({
      group: "nodes",
      id: VpcId as string,
      data: {
        id: VpcId as string,
        type: "EC2-VPC",
        parent: `${_metadata.account}-${_metadata.region}`,
      },
      metadata: { ...vpcInfo },
    })) ?? [],
  );

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

  const azNodes: GraphNode[] = subnetsState.flatMap(({ AvailabilityZone, VpcId }) => ({
    group: "nodes",
    id: `${VpcId}-${AvailabilityZone}`,
    data: {
      id: `${VpcId}-${AvailabilityZone}`,
      type: "EC2-AZ",
      parent: VpcId,
      name: AvailabilityZone,
    },
    metadata: {
      name: AvailabilityZone,
    }
  })) ?? [];

  ec2NetworkingNodes.push(...azNodes);

  const subnets: GraphNode[] = subnetsState.flatMap(({ VpcId, SubnetArn, SubnetId, AvailabilityZone }) => ({
    group: "nodes",
    id: SubnetId as string,
    data: {
      id: SubnetId as string,
      type: "EC2-Subnet",
      parent: `${VpcId}-${AvailabilityZone}`,
      name: SubnetId,
    },
    metadata: {
      name: SubnetId,
      arn: SubnetArn
    },
  })) ?? [];

  ec2NetworkingNodes.push(...subnets);

  return ec2NetworkingNodes;
}
