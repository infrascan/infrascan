import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { env } from "process";
import { DEFAULT_PROFILE } from "@smithy/shared-ini-file-loader";
import type { ParsedIniData } from "@smithy/types";
import { resolveConfigPath, type PathContext } from "./store";

export type AccountScanConfig = {
  profile?: string;
  roleToAssume?: string;
  regions?: string[] | undefined;
  defaultRegion?: string | undefined;
};

export type ScanConfig = AccountScanConfig[];

/**
 * Validate a parsed config file. The existing array format is accepted as-is so config files written for
 * earlier versions of the CLI keep working.
 */
export function parseConfig(raw: unknown, source: string): ScanConfig {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Invalid config in ${source}: expected an array of account configs.`,
    );
  }
  raw.forEach((entry, idx) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `Invalid config in ${source}: entry ${idx} must be an object.`,
      );
    }
    const { regions } = entry as AccountScanConfig;
    if (
      regions != null &&
      (!Array.isArray(regions) || regions.some((r) => typeof r !== "string"))
    ) {
      throw new Error(
        `Invalid config in ${source}: entry ${idx} "regions" must be an array of strings.`,
      );
    }
  });
  return raw as ScanConfig;
}

export function getConfig(path: string): ScanConfig {
  const resolvedConfigPath = resolve(path);
  return parseConfig(
    JSON.parse(readFileSync(resolvedConfigPath, "utf8")),
    resolvedConfigPath,
  );
}

export type ResolvedConfig = {
  config: ScanConfig;
  /** Where the config came from: a file path, or "defaults" when none was found. */
  source: string;
};

/**
 * Resolve the scan config to use. An explicit path wins, then the user's saved config in the standard config
 * directory, then a single-account default using the ambient AWS credentials.
 */
export function resolveScanConfig(
  explicitPath: string | undefined,
  defaultRegion: string | undefined,
  ctx: PathContext = {},
): ResolvedConfig {
  if (explicitPath) {
    return { config: getConfig(explicitPath), source: resolve(explicitPath) };
  }
  const savedPath = resolveConfigPath(ctx);
  if (existsSync(savedPath)) {
    return { config: getConfig(savedPath), source: savedPath };
  }
  return { config: [{ defaultRegion }], source: "defaults" };
}

/** Persist a config to the standard config location so later commands can reuse it. */
export async function saveConfig(
  config: ScanConfig,
  ctx: PathContext = {},
): Promise<string> {
  const target = resolveConfigPath(ctx);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
  return target;
}

export function getDefaultRegion(
  parsedAwsConfig?: ParsedIniData,
  currentProfile?: string,
): string | undefined {
  const profile = currentProfile ?? env.AWS_PROFILE ?? DEFAULT_PROFILE;
  return env.AWS_REGION ?? parsedAwsConfig?.[profile]?.region;
}
