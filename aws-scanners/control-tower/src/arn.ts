export interface ParsedArn {
  partition?: string;
  service?: string;
  region?: string;
  account?: string;
}

/**
 * Splits an ARN, e.g. `arn:aws:controltower:us-east-1:111111111111:landingzone/1A2B3C`, into its fields.
 */
export function parseArn(arn: string | undefined): ParsedArn {
  if (arn == null || !arn.startsWith("arn:")) {
    return {};
  }
  const [, partition, service, region, account] = arn.split(":");
  return { partition, service, region, account };
}

/**
 * Whether a Control Tower resource ARN belongs to the scanned account and region. Control Tower answers in the
 * landing zone's home region only, so this keeps one scan responsible for each resource. Resources without an ARN are
 * kept.
 */
export function isOwnedHere(
  arn: string | undefined,
  context: { account: string; region: string },
): boolean {
  if (arn == null) {
    return true;
  }
  const { account, region } = parseArn(arn);
  return account === context.account && region === context.region;
}

/**
 * The graph node id for a Control Tower target: OU ARNs are used as they are, account ARNs
 * (`arn:aws:organizations::<management>:account/o-x/<id>`) become the 12-digit account id. Anything else has no node.
 */
export function targetNodeId(
  targetIdentifier: string | undefined,
): string | undefined {
  if (targetIdentifier == null || !targetIdentifier.startsWith("arn:")) {
    return undefined;
  }
  const resource = targetIdentifier.split(":").slice(5).join(":");
  if (parseArn(targetIdentifier).service !== "organizations") {
    return undefined;
  }
  if (resource.startsWith("ou/")) {
    return targetIdentifier;
  }
  if (resource.startsWith("account/")) {
    const id = resource.split("/").pop();
    return id != null && /^\d{12}$/.test(id) ? id : undefined;
  }
  return undefined;
}
