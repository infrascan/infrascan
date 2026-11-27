import { env } from "process";
import {
  fromEnv,
  fromIni,
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";
import { DEFAULT_PROFILE } from "@smithy/shared-ini-file-loader";
import type { SharedConfigFiles } from "@smithy/types";
import type { CredentialProviderFactory } from "@infrascan/sdk";
import type { AccountConfig } from "./config";

export const CREDENTIAL_SOURCES = [
  "env",
  "profile",
  "role",
  "default",
] as const;

export type CredentialSourceKind = (typeof CREDENTIAL_SOURCES)[number];

/**
 * Where to load AWS credentials from. `profile` and `role` mirror the `profile` and `roleToAssume`
 * keys of the scan config file.
 */
export type CredentialSource =
  | { kind: "env" }
  | { kind: "profile"; profile: string }
  | { kind: "role"; roleToAssume: string }
  | { kind: "default" };

/**
 * Maps an account from the scan config file onto a credential source.
 * `profile` takes precedence over `roleToAssume`, which takes precedence over `credentialSource`.
 */
export function credentialSourceFromScanConfig(
  account: Pick<AccountConfig, "profile" | "roleToAssume" | "credentialSource">,
): CredentialSource {
  if (account.profile) {
    return { kind: "profile", profile: account.profile };
  }
  if (account.roleToAssume) {
    return { kind: "role", roleToAssume: account.roleToAssume };
  }
  if (account.credentialSource === "env") {
    return { kind: "env" };
  }
  return { kind: "default" };
}

/**
 * The inverse of {@link credentialSourceFromScanConfig}: builds a scan config entry for an account.
 */
export function scanConfigFromCredentialSource(
  source: CredentialSource,
  regions?: string[],
): AccountConfig {
  const regionConfig = regions != null ? { regions } : {};
  switch (source.kind) {
    case "profile":
      return { profile: source.profile, ...regionConfig };
    case "role":
      return { roleToAssume: source.roleToAssume, ...regionConfig };
    case "env":
      return { credentialSource: "env", ...regionConfig };
    default:
      return { ...regionConfig };
  }
}

export function resolveCredentialProvider(
  source: CredentialSource,
  roleSessionName = "infrascan-cli-scan",
): CredentialProviderFactory {
  switch (source.kind) {
    case "env":
      return () => fromEnv();
    case "profile":
      return (region: string) =>
        fromIni({
          profile: source.profile,
          clientConfig: { region },
        });
    case "role":
      return (region: string) =>
        fromTemporaryCredentials({
          params: {
            RoleArn: source.roleToAssume,
            RoleSessionName: roleSessionName,
          },
          clientConfig: { region },
        });
    default:
      return (region: string) =>
        fromNodeProviderChain({ clientConfig: { region } });
  }
}

export function describeCredentialSource(source: CredentialSource): string {
  switch (source.kind) {
    case "env":
      return "environment variables";
    case "profile":
      return `profile "${source.profile}"`;
    case "role":
      return `role ${source.roleToAssume}`;
    default:
      return "default credential provider chain";
  }
}

export function hasEnvCredentials(): boolean {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

/**
 * Lists every profile defined across the shared AWS config and credentials files, with the default profile first.
 */
export function listProfiles(files?: SharedConfigFiles): string[] {
  const profiles = new Set([
    ...Object.keys(files?.configFile ?? {}),
    ...Object.keys(files?.credentialsFile ?? {}),
  ]);
  return [...profiles].sort((a, b) => {
    if (a === DEFAULT_PROFILE) return -1;
    if (b === DEFAULT_PROFILE) return 1;
    return a.localeCompare(b);
  });
}
