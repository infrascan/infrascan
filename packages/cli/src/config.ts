import { readFileSync } from "fs";
import { resolve } from "path";
import { env } from "process";
import { DEFAULT_PROFILE } from "@smithy/shared-ini-file-loader";
import type { ParsedIniData } from "@smithy/types";

export type ScanConfig = {
  profile?: string;
  roleToAssume?: string;
  regions?: string[];
}[];

export function getConfig(path: string): ScanConfig {
  const resolvedConfigPath = resolve(path);
  return JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
}

// Create a default config if file is given - scan the default region.
export function getDefaultConfig(iniDefaultRegion?: ParsedIniData): ScanConfig {
  console.log("No config file given. Deriving config from environment.");
  const defaultRegion =
    env.AWS_REGION ??
    iniDefaultRegion?.[env.AWS_PROFILE ?? DEFAULT_PROFILE]?.region;
  if (defaultRegion != null) {
    console.log("Default region found: ", defaultRegion);
    return [
      {
        regions: [defaultRegion],
      },
    ];
  }
  return [{}];
}
