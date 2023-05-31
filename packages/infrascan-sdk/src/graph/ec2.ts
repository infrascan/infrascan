/**
 * Handles the custom logic for generating EC2 networking nodes
 */

import { evaluateSelector } from "../utils";
import { sanitizeId } from "./graph_utilities";
import type { ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GraphNode } from "@sharedTypes/graph";
import type { State } from "@sharedTypes/scan";
import type { AvailabilityZone, Subnet, Vpc } from "@aws-sdk/client-ec2";

type EC2VpcState = State<Vpc[]>;
type EC2AZState = State<AvailabilityZone[]>;
type EC2SubnetState = State<Subnet[]>;
export async function generateNodesForEc2Networking(
  account: string,
  region: string,
  resolveStateForServiceCall: ResolveStateFromServiceFn
) {
  let ec2NetworkingState: GraphNode[] = [];
  const vpcsState: EC2VpcState[] = await evaluateSelector({
    account,
    region,
    rawSelector: "EC2|describeVpcs|[]",
    resolveStateForServiceCall,
  });
  const vpcNodes: GraphNode[] = vpcsState.flatMap(({ _metadata, _result }) => {
    return _result.map(({ VpcId, ...vpcInfo }) => ({
      group: "nodes",
      id: sanitizeId(VpcId as string),
      data: {
        id: VpcId as string,
        type: "EC2-VPC",
        parent: `${_metadata.account}-${_metadata.region}`,
      },
      metadata: { vpcInfo },
    }));
  });

  ec2NetworkingState = ec2NetworkingState.concat(vpcNodes);

  const availabilityZoneState: EC2AZState[] = await evaluateSelector({
    account,
    region,
    rawSelector: "EC2|describeAvailabilityZones|[]",
    resolveStateForServiceCall,
  });

  /**
   * Main complication with EC2 Networking: Availability Zones have to be forced into
   * VPCs despite not being modelled that way by AWS. This is because VPCs span many AZs,
   * in which subnets exist. So a hierarchy of Region > VPC > AZ > Subnet is the _most_ correct.
   */
  const availabilityZoneNodes: GraphNode[] = vpcsState.flatMap(
    ({ _result }) => {
      return _result.flatMap(({ VpcId }) => {
        return availabilityZoneState[0]._result.map(({ ZoneName }) => ({
          group: "nodes",
          id: sanitizeId(`${ZoneName}-${VpcId}`),
          data: {
            id: `${ZoneName}-${VpcId}`,
            type: "EC2-VPC-AZ",
            parent: VpcId,
          },
        }));
      });
    }
  );

  ec2NetworkingState = ec2NetworkingState.concat(availabilityZoneNodes);

  const subnetsState: EC2SubnetState[] = await evaluateSelector({
    account,
    region,
    rawSelector: "EC2|describeSubnets|[]",
    resolveStateForServiceCall,
  });

  const subnetNodes: GraphNode[] = subnetsState.flatMap(({ _result }) => {
    return _result.map(
      ({ AvailabilityZone, SubnetId, VpcId, ...subnetInfo }) => ({
        group: "nodes",
        id: sanitizeId(SubnetId as string),
        data: {
          id: SubnetId as string,
          type: "EC2-Subnet",
          parent: `${AvailabilityZone}-${VpcId}`,
          name: SubnetId,
        },
        metadata: subnetInfo,
      })
    );
  });

  return ec2NetworkingState.concat(subnetNodes);
}
