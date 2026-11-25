import { createWriteStream, mkdirSync } from "fs";
import { join, relative, resolve } from "path";
import {
  CommandLineAction,
  CommandLineChoiceParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";
import type { SharedConfigFiles } from "@smithy/types";
import buildFsConnector from "@infrascan/fs-connector";
import Infrascan from "@infrascan/sdk";
import type {
  CredentialProviderFactory,
  ScanMetadata,
  ScanProgressEvent,
} from "@infrascan/sdk";
import { serializeGraph as serializeVisualGraph } from "@infrascan/cytoscape-serializer";
import { serializeGraph as serializeInformationalGraph } from "@infrascan/informational-serializer";
import { getConfig, getDefaultRegion, writeConfig } from "../config";
import {
  CREDENTIAL_SOURCES,
  CredentialSource,
  CredentialSourceKind,
  describeCredentialSource,
  hasEnvCredentials,
  listProfiles,
  resolveCredentialProvider,
  credentialSourceFromScanConfig,
  scanConfigFromCredentialSource,
} from "../credentials";
import {
  canPrompt,
  isPromptCancelled,
  promptAddAnotherAccount,
  promptCredentialSource,
  promptProfile,
  promptSaveEnvironment,
  promptRegions,
  promptRegionsFreeform,
  promptRoleArn,
} from "../prompts";
import { ProgressLine, formatDuration, redirectConsole } from "../progress";
import {
  GRAPH_FILE,
  INFORMATIONAL_GRAPH_FILE,
  writeGraphOutput,
  writeScanMetadata,
} from "../state";

// Matches the fallback used by @infrascan/sdk when no default region is given.
const FALLBACK_REGION = "us-east-1";
const ROLE_SESSION_NAME = "infrascan-cli-quickstart";
const LOG_FILE = "quickstart.log";

/**
 * One account to scan, with resolved credentials and regions.
 */
type AccountTarget = {
  credentialSource: CredentialSource;
  /** Regions to scan. Undefined scans every region, matching the scan command. */
  regions?: string[];
  defaultRegion: string;
  /** Account ID, when credentials were checked before scanning. */
  account?: string;
};

const USAGE_ERROR = "QuickstartUsageError";

/**
 * An error caused by how the command was invoked, which is reported without a stack trace.
 */
function usageError(message: string): Error {
  const err = new Error(message);
  err.name = USAGE_ERROR;
  return err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath.startsWith("..") ? path : `./${relativePath}`;
}

async function getCallerIdentity(
  credentials: CredentialProviderFactory,
  region: string,
): Promise<{ arn?: string; account?: string }> {
  const sts = new STSClient({ region, credentials: await credentials(region) });
  const { Arn, Account } = await sts.send(new GetCallerIdentityCommand({}));
  return { arn: Arn, account: Account };
}

/**
 * Lists the regions enabled for the account (excludes opt-in regions which haven't been enabled).
 */
async function listEnabledRegions(
  credentials: CredentialProviderFactory,
  region: string,
): Promise<string[]> {
  const ec2 = new EC2Client({ region, credentials: await credentials(region) });
  const { Regions } = await ec2.send(new DescribeRegionsCommand({}));
  return (Regions ?? [])
    .map(({ RegionName }) => RegionName)
    .filter((name): name is string => name != null)
    .sort();
}

/**
 * Renders the SDK's scan progress events onto a single status line, with a permanent line per completed region.
 */
function createScanProgressRenderer(progress: ProgressLine, label: string) {
  let sectionStartedAt = Date.now();
  return (event: ScanProgressEvent) => {
    switch (event.type) {
      case "account-start":
        progress.log(`Scanning account ${event.account} ${label}`);
        progress.update(`${event.account} › starting`);
        break;
      case "service-start":
        if (event.serviceIndex === 0) {
          sectionStartedAt = Date.now();
        }
        if (event.scope === "global") {
          progress.update(
            `${event.account} › global › ${event.service} (${
              event.serviceIndex + 1
            }/${event.serviceCount})`,
          );
        } else {
          progress.update(
            `${event.account} › ${event.region} [${event.regionIndex + 1}/${
              event.regionCount
            }] › ${event.service} (${event.serviceIndex + 1}/${
              event.serviceCount
            })`,
          );
        }
        break;
      case "service-complete":
        if (event.serviceIndex === event.serviceCount - 1) {
          const section = event.scope === "global" ? "global" : event.region;
          progress.log(
            `  ✔ ${section} · ${event.serviceCount} services · ${formatDuration(
              Date.now() - sectionStartedAt,
            )}`,
          );
        }
        break;
      default:
        break;
    }
  };
}

function defaultRegionFor(
  credentialSource: CredentialSource,
  awsConfig?: SharedConfigFiles,
): string {
  return (
    getDefaultRegion(
      awsConfig?.configFile,
      credentialSource.kind === "profile"
        ? credentialSource.profile
        : undefined,
    ) ?? FALLBACK_REGION
  );
}

/**
 * Prompts for a credential source, and the profile or role it needs. Skips the first question when `kind` is known.
 */
async function promptCredentialSourceDetails(
  awsConfig?: SharedConfigFiles,
  knownKind?: CredentialSourceKind,
): Promise<CredentialSource> {
  const profiles = listProfiles(awsConfig);
  const kind =
    knownKind ??
    (await promptCredentialSource({
      envCredentialsAvailable: hasEnvCredentials(),
      profiles,
    }));
  switch (kind) {
    case "profile":
      if (profiles.length === 0) {
        throw usageError(
          "No profiles found in your AWS config or credentials files.",
        );
      }
      return { kind, profile: await promptProfile(profiles, awsConfig) };
    case "role":
      return { kind, roleToAssume: await promptRoleArn() };
    case "env":
      return { kind };
    default:
      return { kind: "default" };
  }
}

export default class QuickstartCmd extends CommandLineAction {
  #config: CommandLineStringParameter;

  #profile: CommandLineStringParameter;

  #roleToAssume: CommandLineStringParameter;

  #credentialSource: CommandLineChoiceParameter;

  #regions: CommandLineStringListParameter;

  #outputDirectory: CommandLineStringParameter;

  private infrascanClient: Infrascan;

  public constructor(infrascanClient: Infrascan) {
    super({
      actionName: "quickstart",
      summary: "Scans an environment of AWS accounts and graphs it in one step",
      documentation:
        "Scans one or more AWS accounts (an environment) and generates both a visual (cytoscape) graph and an informational graph covering all of them.\n\n" +
        "Pass an environment file with --config (the same format as the scan command), or credentials and regions for a single account as flags. " +
        "Anything not given is prompted for when running in a terminal, including whether to add more accounts and to save the environment to a file. " +
        "Outside of a terminal, the default credential provider chain and the default region from your AWS config are used.",
    });
    this.infrascanClient = infrascanClient;
  }

  protected onDefineParameters(): void {
    this.#config = this.defineStringParameter({
      parameterLongName: "--config",
      parameterShortName: "-c",
      argumentName: "PATH_TO_CONFIG",
      description:
        "Environment file listing the accounts and regions to scan, in the same format as the scan command's config. Can't be combined with --profile, --role-to-assume or --credential-source.",
    });
    this.#profile = this.defineStringParameter({
      parameterLongName: "--profile",
      argumentName: "PROFILE",
      description:
        'AWS profile to scan with, from your shared config or credentials file. Equivalent to "profile" in the scan config file.',
    });
    this.#roleToAssume = this.defineStringParameter({
      parameterLongName: "--role-to-assume",
      argumentName: "ROLE_ARN",
      description:
        'ARN of an IAM role to assume for the scan, using the default credential provider chain. Equivalent to "roleToAssume" in the scan config file.',
    });
    this.#credentialSource = this.defineChoiceParameter({
      parameterLongName: "--credential-source",
      alternatives: [...CREDENTIAL_SOURCES],
      description:
        'Where to load credentials from. "profile" and "role" are implied by --profile and --role-to-assume. Use "env" for environment variables, or "default" for the default credential provider chain.',
    });
    this.#regions = this.defineStringListParameter({
      parameterLongName: "--region",
      argumentName: "REGION_TO_SCAN",
      description:
        "The region to scan, applied to every account. This flag can be provided many times e.g. --region us-east-1 --region eu-west-1",
    });
    this.#outputDirectory = this.defineStringParameter({
      parameterLongName: "--output",
      parameterShortName: "-o",
      argumentName: "PATH_TO_STATE_OUTPUT",
      description: "Location to save scan state and graphs to.",
      defaultValue: "./state",
    });
  }

  protected async onExecute(): Promise<void> {
    const awsConfig = await loadSharedConfigFiles().catch(() => undefined);

    let targets: AccountTarget[];
    try {
      targets = this.#config.value
        ? this.#readEnvironment(this.#config.value, awsConfig)
        : await this.#buildEnvironment(awsConfig);
    } catch (err) {
      if (isPromptCancelled(err)) {
        process.exitCode = 130;
        return;
      }
      if (err instanceof Error && err.name === USAGE_ERROR) {
        console.error(`✖ ${err.message}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    await this.#scanAndGraph(targets);
  }

  get #runtimeRegions(): string[] | undefined {
    return this.#regions.values.length > 0
      ? [...this.#regions.values]
      : undefined;
  }

  /**
   * Loads an environment from a config file. Regions given with --region replace each account's regions, as in scan.
   */
  #readEnvironment(
    path: string,
    awsConfig?: SharedConfigFiles,
  ): AccountTarget[] {
    if (
      this.#profile.value ||
      this.#roleToAssume.value ||
      this.#credentialSource.value
    ) {
      throw usageError(
        "--config can't be combined with --profile, --role-to-assume or --credential-source.",
      );
    }
    let config;
    try {
      config = getConfig(path);
    } catch (err) {
      throw usageError(`Couldn't read ${path}: ${errorMessage(err)}`);
    }
    if (config.length === 0) {
      throw usageError(`${path} doesn't list any accounts.`);
    }
    return config.map((accountConfig) => {
      const credentialSource = credentialSourceFromScanConfig(accountConfig);
      if (credentialSource.kind === "env" && !hasEnvCredentials()) {
        throw usageError(
          `${path} uses environment credentials, but AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY aren't set.`,
        );
      }
      return {
        credentialSource,
        regions: this.#runtimeRegions ?? accountConfig.regions,
        defaultRegion:
          accountConfig.defaultRegion ??
          defaultRegionFor(credentialSource, awsConfig),
      };
    });
  }

  /**
   * Builds an environment from flags and prompts. When credentials were prompted for, keeps offering to add more
   * accounts, then offers to save the environment as a config file.
   */
  async #buildEnvironment(
    awsConfig?: SharedConfigFiles,
  ): Promise<AccountTarget[]> {
    const credentialsFromFlags = Boolean(
      this.#profile.value ||
        this.#roleToAssume.value ||
        this.#credentialSource.value,
    );
    const credentialSource = await this.#resolveCredentialSource(awsConfig);
    const first = await this.#resolveAccount(credentialSource, awsConfig);
    if (first == null) {
      throw usageError("Couldn't resolve the account to scan.");
    }
    const targets: AccountTarget[] = [first];

    if (credentialsFromFlags || !canPrompt()) {
      return targets;
    }

    while (await promptAddAnotherAccount(targets.length)) {
      const nextSource = await promptCredentialSourceDetails(awsConfig);
      const next = await this.#resolveAccount(nextSource, awsConfig, targets);
      if (next != null) {
        targets.push(next);
      }
    }

    const savePath = await promptSaveEnvironment();
    if (savePath != null) {
      writeConfig(
        savePath,
        targets.map(({ credentialSource: source, regions }) =>
          scanConfigFromCredentialSource(source, regions),
        ),
      );
      console.log(
        `✔ Saved environment to ${savePath}. Reuse it with: infrascan quickstart -c ${savePath}`,
      );
    }
    return targets;
  }

  async #resolveCredentialSource(
    awsConfig?: SharedConfigFiles,
  ): Promise<CredentialSource> {
    const profile = this.#profile.value;
    const roleToAssume = this.#roleToAssume.value;
    const explicitSource = this.#credentialSource.value as
      | CredentialSourceKind
      | undefined;

    if (profile && roleToAssume) {
      throw usageError(
        "--profile and --role-to-assume can't be used together.",
      );
    }
    let impliedSource: CredentialSourceKind | undefined;
    if (profile) {
      impliedSource = "profile";
    } else if (roleToAssume) {
      impliedSource = "role";
    }
    if (explicitSource && impliedSource && explicitSource !== impliedSource) {
      throw usageError(
        `--credential-source ${explicitSource} can't be combined with --${
          impliedSource === "profile" ? "profile" : "role-to-assume"
        }.`,
      );
    }

    const kind = explicitSource ?? impliedSource;
    if (kind == null) {
      if (!canPrompt()) {
        return { kind: "default" };
      }
      return promptCredentialSourceDetails(awsConfig);
    }

    switch (kind) {
      case "profile":
        if (profile) {
          return { kind, profile };
        }
        if (!canPrompt()) {
          throw usageError(
            "--credential-source profile requires --profile when not running in a terminal.",
          );
        }
        return promptCredentialSourceDetails(awsConfig, kind);
      case "role":
        if (roleToAssume) {
          return { kind, roleToAssume };
        }
        if (!canPrompt()) {
          throw usageError(
            "--credential-source role requires --role-to-assume when not running in a terminal.",
          );
        }
        return promptCredentialSourceDetails(awsConfig, kind);
      case "env":
        if (!hasEnvCredentials()) {
          throw usageError(
            "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set to use environment credentials.",
          );
        }
        return { kind };
      default:
        return { kind: "default" };
    }
  }

  /**
   * Resolves the regions for an account. When prompting, the credentials are checked first, and an account already in
   * the environment is turned away (returns undefined).
   */
  async #resolveAccount(
    credentialSource: CredentialSource,
    awsConfig?: SharedConfigFiles,
    existing: AccountTarget[] = [],
  ): Promise<AccountTarget | undefined> {
    const defaultRegion = defaultRegionFor(credentialSource, awsConfig);
    const runtimeRegions = this.#runtimeRegions;
    if (!canPrompt()) {
      return {
        credentialSource,
        defaultRegion,
        regions: runtimeRegions ?? [defaultRegion],
      };
    }

    // Check the credentials work before asking anything else, and use them to find the account's regions.
    const credentials = resolveCredentialProvider(
      credentialSource,
      ROLE_SESSION_NAME,
    );
    const progress = new ProgressLine();
    progress.update(
      `Checking credentials (${describeCredentialSource(credentialSource)})…`,
    );
    let account: string | undefined;
    try {
      const identity = await getCallerIdentity(credentials, defaultRegion);
      account = identity.account;
      progress.succeed(`Authenticated as ${identity.arn}`);
    } catch (err) {
      progress.fail(
        `Could not authenticate using ${describeCredentialSource(
          credentialSource,
        )}`,
      );
      if (existing.length === 0) {
        throw usageError(errorMessage(err));
      }
      progress.log(`  ${errorMessage(err)}`);
      return undefined;
    }

    if (account != null && existing.some((t) => t.account === account)) {
      progress.log(
        `  ⚠ Account ${account} is already in this environment, so it wasn't added again.`,
      );
      return undefined;
    }

    if (runtimeRegions != null) {
      return {
        credentialSource,
        defaultRegion,
        regions: runtimeRegions,
        account,
      };
    }

    progress.update("Listing regions…");
    const availableRegions = await listEnabledRegions(
      credentials,
      defaultRegion,
    ).catch(() => []);
    progress.stop();

    const regions =
      availableRegions.length === 0
        ? await promptRegionsFreeform(defaultRegion)
        : await promptRegions(availableRegions, defaultRegion);
    return { credentialSource, defaultRegion, regions, account };
  }

  async #scanAndGraph(targets: AccountTarget[]): Promise<void> {
    const outputDirectory = resolve(this.#outputDirectory.value as string);
    mkdirSync(outputDirectory, { recursive: true });
    const logPath = join(outputDirectory, LOG_FILE);
    const logStream = createWriteStream(logPath, { flags: "w" });
    const logError = (err: unknown) => {
      logStream.write(
        `${new Date().toISOString()} ERROR ${
          err instanceof Error ? err.stack : String(err)
        }\n`,
      );
    };

    const progress = new ProgressLine();
    if (targets.length > 1) {
      progress.log(`Scanning an environment of ${targets.length} accounts`);
    }

    // Everything the SDK and scanners log goes to the log file rather than the terminal.
    const restoreConsole = redirectConsole(logStream);
    const startedAt = Date.now();
    const scanMetadata: ScanMetadata[] = [];
    const failures: string[] = [];
    try {
      const connector = buildFsConnector(outputDirectory, {
        createTargetDirectory: true,
      });

      for (const [index, target] of targets.entries()) {
        const { credentialSource, regions, defaultRegion } = target;
        const source = describeCredentialSource(credentialSource);
        const position =
          targets.length > 1 ? `${index + 1}/${targets.length}` : "";
        const label = position ? `(${position} · ${source})` : `(${source})`;
        const failureLabel = position
          ? `${position} (${source})`
          : `(${source})`;
        const renderScanProgress = createScanProgressRenderer(progress, label);
        progress.update(`Connecting to AWS ${label}…`);
        try {
          const accountMetadata = await this.infrascanClient.performScan(
            resolveCredentialProvider(credentialSource, ROLE_SESSION_NAME),
            connector,
            {
              regions,
              defaultRegion,
              onProgress: (event) => {
                if (event.type === "regions-resolved" && regions != null) {
                  const skipped = regions.filter(
                    (region) => !event.regions.includes(region),
                  );
                  if (skipped.length > 0) {
                    progress.log(
                      `  ⚠ Skipping unknown region(s): ${skipped.join(", ")}`,
                    );
                  }
                }
                renderScanProgress(event);
              },
            },
          );
          scanMetadata.push(accountMetadata);
        } catch (err) {
          // Keep going so the rest of the environment is still scanned and graphed.
          logError(err);
          failures.push(failureLabel);
          progress.fail(`Account ${failureLabel} failed: ${errorMessage(err)}`);
        }
      }

      if (scanMetadata.length === 0) {
        throw new Error("No accounts could be scanned.");
      }
      writeScanMetadata(outputDirectory, scanMetadata);
      const regionCount = scanMetadata.reduce(
        (total, { regions }) => total + regions.length,
        0,
      );
      const accountSummary =
        targets.length > 1 ? `${scanMetadata.length} account(s), ` : "";
      progress.succeed(
        `Scanned ${accountSummary}${regionCount} region(s) in ${formatDuration(
          Date.now() - startedAt,
        )}`,
      );

      progress.update("Building graph…");
      const graphs = await this.infrascanClient.generateGraph(
        scanMetadata,
        connector,
        (graph) => ({
          visual: serializeVisualGraph(graph),
          informational: serializeInformationalGraph(graph),
        }),
      );
      const visualPath = writeGraphOutput(
        outputDirectory,
        graphs.visual,
        GRAPH_FILE,
      );
      const informationalPath = writeGraphOutput(
        outputDirectory,
        graphs.informational,
        INFORMATIONAL_GRAPH_FILE,
      );
      progress.succeed(
        `Built graph with ${graphs.informational.nodes.length} nodes and ${graphs.informational.edges.length} edges`,
      );

      progress.log("");
      progress.log(`  Visual graph:        ${displayPath(visualPath)}`);
      progress.log(`  Informational graph: ${displayPath(informationalPath)}`);
      progress.log(`  Scan log:            ${displayPath(logPath)}`);
      progress.log("");
      if (failures.length > 0) {
        progress.log(
          `⚠ ${failures.length} account(s) failed and are missing from the graph. See the scan log for details.`,
        );
        process.exitCode = 1;
      }
      progress.log(
        `View it with: infrascan render --input ${displayPath(
          visualPath,
        )} --browser`,
      );
    } catch (err) {
      logError(err);
      progress.fail(`Quickstart failed: ${errorMessage(err)}`);
      progress.log(`  See ${displayPath(logPath)} for details.`);
      process.exitCode = 1;
    } finally {
      progress.stop();
      restoreConsole();
      await new Promise<void>((done) => {
        logStream.end(done);
      });
    }
  }
}
