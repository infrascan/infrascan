export interface ParsedArn {
  partition?: string;
  service?: string;
  region?: string;
  account?: string;
}

/**
 * Splits an ARN, e.g. `arn:aws:cloudtrail:us-east-1:111111111111:trail/management`, into its fields.
 */
export function parseArn(arn: string | undefined): ParsedArn {
  if (arn == null || !arn.startsWith("arn:")) {
    return {};
  }
  const [, partition, service, region, account] = arn.split(":");
  return { partition, service, region, account };
}
