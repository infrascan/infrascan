import { readFileSync } from "fs";
import { resolve } from "path";
import { env } from "process";
import { DEFAULT_PROFILE } from "@smithy/shared-ini-file-loader";
import type { ParsedIniData } from "@smithy/types";

export type ScanConfig = {
  profile?: string;
  roleToAssume?: string;
  regions?: string[] | undefined;
  defaultRegion?: string | undefined;
}[];

export function getConfig(path: string): ScanConfig {
  const resolvedConfigPath = resolve(path);
  return JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
}

export function getDefaultRegion(
  parsedAwsConfig?: ParsedIniData,
  currentProfile?: string,
): string | undefined {
  const profile = currentProfile ?? env.AWS_PROFILE ?? DEFAULT_PROFILE;
  return env.AWS_REGION ?? parsedAwsConfig?.[profile]?.region;
}
