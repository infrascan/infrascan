import { checkbox, input, select } from "@inquirer/prompts";
import type { SharedConfigFiles } from "@smithy/types";
import type { CredentialSourceKind } from "./credentials";

const ROLE_ARN_PATTERN = /^arn:aws[a-z-]*:iam::\d{12}:role\/.+$/;
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

/**
 * Prompts can only be shown when both stdin and stdout are attached to a terminal.
 */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Inquirer rejects with an `ExitPromptError` when the user hits ctrl+c during a prompt.
 */
export function isPromptCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === "ExitPromptError";
}

export async function promptCredentialSource(opts: {
  envCredentialsAvailable: boolean;
  profiles: string[];
}): Promise<CredentialSourceKind> {
  const { envCredentialsAvailable, profiles } = opts;
  let defaultSource: CredentialSourceKind = "default";
  if (envCredentialsAvailable) {
    defaultSource = "env";
  } else if (profiles.length > 0) {
    defaultSource = "profile";
  }

  return select<CredentialSourceKind>({
    message: "Where should infrascan load AWS credentials from?",
    default: defaultSource,
    choices: [
      {
        name: "Environment variables",
        value: "env",
        description:
          "Uses AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN.",
        disabled: envCredentialsAvailable ? false : "(not set)",
      },
      {
        name: "Profile from AWS config files",
        value: "profile",
        description:
          "Uses a profile from ~/.aws/config or ~/.aws/credentials (including SSO profiles).",
        disabled: profiles.length > 0 ? false : "(no profiles found)",
      },
      {
        name: "Assume an IAM role",
        value: "role",
        description:
          "Assumes a role, using the default credential provider chain to make the request.",
      },
      {
        name: "Default credential provider chain",
        value: "default",
        description:
          "Lets the AWS SDK find credentials: environment, AWS_PROFILE, SSO, container or instance metadata.",
      },
    ],
  });
}

export async function promptProfile(
  profiles: string[],
  awsConfig?: SharedConfigFiles,
): Promise<string> {
  const envProfile = process.env.AWS_PROFILE;
  return select<string>({
    message: "Which profile should be used?",
    default:
      envProfile != null && profiles.includes(envProfile)
        ? envProfile
        : undefined,
    pageSize: 12,
    choices: profiles.map((profile) => {
      const region = awsConfig?.configFile?.[profile]?.region;
      return {
        name: profile,
        value: profile,
        description: region ? `Default region: ${region}` : undefined,
      };
    }),
  });
}

export async function promptRoleArn(): Promise<string> {
  const roleArn = await input({
    message: "ARN of the role to assume:",
    validate: (value) =>
      ROLE_ARN_PATTERN.test(value.trim()) ||
      "Expected a role ARN, e.g. arn:aws:iam::123456789012:role/InfrascanReadOnly",
  });
  return roleArn.trim();
}

export async function promptRegions(
  availableRegions: string[],
  defaultRegion: string,
): Promise<string[]> {
  return checkbox<string>({
    message: "Which regions should be scanned?",
    pageSize: 12,
    choices: availableRegions.map((region) => ({
      name: region,
      value: region,
      checked: region === defaultRegion,
    })),
    validate: (selected) =>
      selected.length > 0 || "Select at least one region (space to toggle).",
  });
}

/**
 * Fallback for when the account's regions can't be listed (e.g. missing ec2:DescribeRegions permission).
 */
export async function promptRegionsFreeform(
  defaultRegion: string,
): Promise<string[]> {
  const parseRegions = (value: string) =>
    value
      .split(/[\s,]+/)
      .map((region) => region.trim())
      .filter((region) => region.length > 0);

  const answer = await input({
    message: "Which regions should be scanned? (comma separated)",
    default: defaultRegion,
    validate: (value) => {
      const regions = parseRegions(value);
      if (regions.length === 0) {
        return "Enter at least one region.";
      }
      const invalid = regions.filter((region) => !REGION_PATTERN.test(region));
      return (
        invalid.length === 0 || `Not a valid region: ${invalid.join(", ")}`
      );
    },
  });
  return parseRegions(answer);
}
