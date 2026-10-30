/**
 * Helpers for building and parsing RDS ARNs.
 *
 * RDS ARNs take the form `arn:<partition>:rds:<region>:<account>:<resource-type>:<identifier>`.
 * The resource types used by this scanner are `db` (instances), `cluster` (DB clusters), `db-proxy`, and
 * `global-cluster` (which has an empty region component).
 */

const DEFAULT_PARTITION = "aws";

export interface RdsArnComponents {
  partition: string;
  region: string;
  account: string;
  resourceType: string;
  identifier: string;
}

export function parseRdsArn(
  arn: string | undefined,
): RdsArnComponents | undefined {
  if (arn == null) {
    return undefined;
  }
  const parts = arn.split(":");
  if (parts.length < 7 || parts[0] !== "arn" || parts[2] !== "rds") {
    return undefined;
  }
  return {
    partition: parts[1],
    region: parts[3],
    account: parts[4],
    resourceType: parts[5],
    identifier: parts.slice(6).join(":"),
  };
}

export function buildRdsArn({
  partition,
  region,
  account,
  resourceType,
  identifier,
}: Omit<RdsArnComponents, "partition"> & { partition?: string }): string {
  return `arn:${
    partition ?? DEFAULT_PARTITION
  }:rds:${region}:${account}:${resourceType}:${identifier}`;
}

/**
 * Builds the ARN of a DB cluster from its identifier, preferring the partition/region/account of a related ARN
 * (e.g. a member instance's ARN, or a proxy's ARN) where one is available.
 */
export function buildClusterArn(
  clusterIdentifier: string,
  context: { account: string; region: string; partition?: string },
  relatedArn?: string,
): string {
  const related = parseRdsArn(relatedArn);
  return buildRdsArn({
    partition: related?.partition ?? context.partition,
    region: related?.region ?? context.region,
    account: related?.account ?? context.account,
    resourceType: "cluster",
    identifier: clusterIdentifier,
  });
}
