import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  Connector,
  GraphNode,
  State,
} from "@infrascan/shared-types";
import type { Subnet, Vpc } from "@aws-sdk/client-ec2";

export async function getNodes(
  connector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const ec2NetworkingNodes: GraphNode[] = [];
  const vpcs: State<Vpc[]>[] = await evaluateSelector(
    context.account,
    context.region,
    "EC2|DescribeVpcs|[]",
    connector,
  );
  const vpcNodes: GraphNode[] = vpcs.flatMap(({ _metadata, _result }) =>
    _result.map(({ VpcId, ...vpcInfo }) => ({
      group: "nodes",
      id: VpcId as string,
      data: {
        id: VpcId as string,
        type: "EC2-VPC",
        parent: `${_metadata.account}-${_metadata.region}`,
      },
      metadata: { ...vpcInfo },
    })),
  );

  ec2NetworkingNodes.push(...vpcNodes);

  /**
   * Main complication with EC2 Networking: Availability Zones have to be forced into
   * VPCs despite not being modelled that way by AWS. This is because VPCs span many AZs,
   * in which subnets exist. So a hierarchy of Region > VPC > AZ > Subnet is the _most_ correct.
   */
  const subnetsState: State<Subnet[]>[] = await evaluateSelector(
    context.account,
    context.region,
    "EC2|DescribeSubnets|[]",
    connector,
  );

  const azNodes: GraphNode[] = subnetsState.flatMap(({ _result }) =>
    _result.map(({ AvailabilityZoneId, AvailabilityZone, VpcId }) => ({
      group: "nodes",
      id: `${VpcId}-${AvailabilityZoneId}`,
      data: {
        id: `${VpcId}-${AvailabilityZoneId}`,
        type: "EC2-AZ",
        parent: VpcId,
      },
      metadata: {
        name: AvailabilityZone,
      },
    })),
  );

  ec2NetworkingNodes.push(...azNodes);

  const subnets: GraphNode[] = subnetsState.flatMap(({ _result }) =>
    _result.map(({ VpcId, SubnetArn, SubnetId, AvailabilityZoneId }) => ({
      group: "nodes",
      id: SubnetArn as string,
      data: {
        id: SubnetArn as string,
        type: "EC2-Subnet",
        parent: `${VpcId}-${AvailabilityZoneId}`,
      },
      metadata: {
        name: SubnetId,
      },
    })),
  );

  ec2NetworkingNodes.push(...subnets);

  return ec2NetworkingNodes;
}
