/**
 * Handles the custom logic for generating EC2 networking nodes
 */

const { evaluateSelector } = require("../utils");
const { sanitizeId } = require("./graphUtilities");

function generateNodesForEc2Networking(account, region) {
  let ec2NetworkingState = [];
  const vpcsState = evaluateSelector(account, region, "EC2|describeVpcs|[]");
  const vpcNodes = vpcsState.flatMap(({ _metadata, _result }) => {
    return _result.map(({ VpcId, ...vpcInfo }) => ({
      group: "nodes",
      id: sanitizeId(VpcId),
      data: {
        id: VpcId,
        type: "EC2-VPC",
        parent: `${_metadata.account}-${_metadata.region}`,
        info: vpcInfo,
      },
    }));
  });

  ec2NetworkingState = ec2NetworkingState.concat(vpcNodes);

  const availabilityZoneState = evaluateSelector(
    account,
    region,
    "EC2|describeAvailabilityZones|[]"
  );

  /**
   * Main complication with EC2 Networking: Availability Zones have to be forced into
   * VPCs despite not being modelled that way by AWS. This is because VPCs span many AZs,
   * in which subnets exist. So a hierarchy of Region > VPC > AZ > Subnet is the _most_ correct.
   */
  const availabilityZoneNodes = vpcsState.flatMap(({ _result }) => {
    return _result.flatMap(({ VpcId }) => {
      return availabilityZoneState[0]._result.AvailabilityZones.map(
        ({ ZoneName }) => ({
          group: "nodes",
          id: sanitizeId(`${ZoneName}-${VpcId}`),
          data: {
            id: `${ZoneName}-${VpcId}`,
            type: "EC2-VPC-AZ",
            parent: VpcId,
          },
        })
      );
    });
  });

  ec2NetworkingState = ec2NetworkingState.concat(availabilityZoneNodes);

  const subnetsState = evaluateSelector(
    account,
    region,
    "EC2|describeSubnets|[]"
  );

  const subnetNodes = subnetsState.flatMap(({ _result }) => {
    return _result.map(
      ({ AvailabilityZone, SubnetId, VpcId, ...subnetInfo }) => ({
        group: "nodes",
        id: sanitizeId(SubnetId),
        data: {
          id: SubnetId,
          type: "EC2-Subnet",
          parent: `${AvailabilityZone}-${VpcId}`,
          name: SubnetId,
          info: subnetInfo,
        },
      })
    );
  });

  return ec2NetworkingState.concat(subnetNodes);
}

module.exports = {
  generateNodesForEc2Networking,
};
