import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { env } from "process";
import { DEFAULT_PROFILE } from "@smithy/shared-ini-file-loader";
import type { ParsedIniData } from "@smithy/types";

/**
 * One account within an environment, and the regions to scan in it.
 *
 * Credentials are resolved from `profile`, then `roleToAssume`, then `credentialSource`. With none of these set,
 * the default credential provider chain is used.
 */
export type AccountConfig = {
  profile?: string;
  roleToAssume?: string;
  credentialSource?: "env" | "default";
  regions?: string[] | undefined;
  defaultRegion?: string | undefined;
};

/**
 * An environment: a group of accounts, each with the regions to scan. This is the format of the scan config file.
 */
export type ScanConfig = AccountConfig[];

const ACCOUNT_CONFIG_KEYS = new Set([
  "profile",
  "roleToAssume",
  "credentialSource",
  "regions",
  "defaultRegion",
]);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Checks the structure of a parsed config file, throwing an error which names the first problem found.
 */
export function validateConfig(config: unknown): ScanConfig {
  if (!Array.isArray(config)) {
    throw new Error("Expected the config to be a list of accounts.");
  }
  config.forEach((entry: unknown, index) => {
    const where = `Account ${index + 1} in the config`;
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${where} must be an object.`);
    }
    const account = entry as Record<string, unknown>;
    const unknownKeys = Object.keys(account).filter(
      (key) => !ACCOUNT_CONFIG_KEYS.has(key),
    );
    if (unknownKeys.length > 0) {
      throw new Error(`${where} has unknown keys: ${unknownKeys.join(", ")}.`);
    }
    for (const key of ["profile", "roleToAssume", "defaultRegion"]) {
      if (account[key] != null && typeof account[key] !== "string") {
        throw new Error(`${where}: "${key}" must be a string.`);
      }
    }
    if (
      account.credentialSource != null &&
      account.credentialSource !== "env" &&
      account.credentialSource !== "default"
    ) {
      throw new Error(
        `${where}: "credentialSource" must be "env" or "default".`,
      );
    }
    if (account.regions != null && !isStringArray(account.regions)) {
      throw new Error(`${where}: "regions" must be a list of region names.`);
    }
  });
  return config as ScanConfig;
}

export function getConfig(path: string): ScanConfig {
  const resolvedConfigPath = resolve(path);
  return validateConfig(JSON.parse(readFileSync(resolvedConfigPath, "utf8")));
}

export function writeConfig(path: string, config: ScanConfig) {
  writeFileSync(resolve(path), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function getDefaultRegion(
  parsedAwsConfig?: ParsedIniData,
  currentProfile?: string,
): string | undefined {
  const profile = currentProfile ?? env.AWS_PROFILE ?? DEFAULT_PROFILE;
  return env.AWS_REGION ?? parsedAwsConfig?.[profile]?.region;
}
