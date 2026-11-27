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
  ScanProgressEvent,
} from "@infrascan/sdk";
import { serializeGraph as serializeVisualGraph } from "@infrascan/cytoscape-serializer";
import { serializeGraph as serializeInformationalGraph } from "@infrascan/informational-serializer";
import { getDefaultRegion } from "../config";
import {
  CREDENTIAL_SOURCES,
  CredentialSource,
  CredentialSourceKind,
  describeCredentialSource,
  hasEnvCredentials,
  listProfiles,
  resolveCredentialProvider,
} from "../credentials";
import {
  canPrompt,
  isPromptCancelled,
  promptCredentialSource,
  promptProfile,
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

async function getCallerArn(
  credentials: CredentialProviderFactory,
  region: string,
): Promise<string | undefined> {
  const sts = new STSClient({ region, credentials: await credentials(region) });
  const { Arn } = await sts.send(new GetCallerIdentityCommand({}));
  return Arn;
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
function createScanProgressRenderer(progress: ProgressLine) {
  let sectionStartedAt = Date.now();
  return (event: ScanProgressEvent) => {
    switch (event.type) {
      case "account-start":
        progress.log(`Scanning account ${event.account}`);
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
          const label = event.scope === "global" ? "global" : event.region;
          progress.log(
            `  ✔ ${label} · ${event.serviceCount} services · ${formatDuration(
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

export default class QuickstartCmd extends CommandLineAction {
  #profile: CommandLineStringParameter;

  #roleToAssume: CommandLineStringParameter;

  #credentialSource: CommandLineChoiceParameter;

  #regions: CommandLineStringListParameter;

  #outputDirectory: CommandLineStringParameter;

  private infrascanClient: Infrascan;

  public constructor(infrascanClient: Infrascan) {
    super({
      actionName: "quickstart",
      summary: "Scans an AWS account and graphs it in one step",
      documentation:
        "Scans a single AWS account and generates both a visual (cytoscape) graph and an informational graph from the result.\n\n" +
        "Credentials and regions can be given as flags. Anything not given is prompted for when running in a terminal. " +
        "Outside of a terminal, the default credential provider chain and the default region from your AWS config are used.",
    });
    this.infrascanClient = infrascanClient;
  }

  protected onDefineParameters(): void {
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
        "The region to scan. This flag can be provided many times e.g. --region us-east-1 --region eu-west-1",
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

    let credentialSource: CredentialSource;
    let defaultRegion: string;
    let regions: string[];
    try {
      credentialSource = await this.#resolveCredentialSource(awsConfig);
      defaultRegion =
        getDefaultRegion(
          awsConfig?.configFile,
          credentialSource.kind === "profile"
            ? credentialSource.profile
            : undefined,
        ) ?? FALLBACK_REGION;
      regions = await this.#resolveRegions(credentialSource, defaultRegion);
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

    await this.#scanAndGraph(credentialSource, defaultRegion, regions);
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

    const profiles = listProfiles(awsConfig);
    let kind = explicitSource ?? impliedSource;
    if (kind == null) {
      if (!canPrompt()) {
        return { kind: "default" };
      }
      kind = await promptCredentialSource({
        envCredentialsAvailable: hasEnvCredentials(),
        profiles,
      });
    }

    switch (kind) {
      case "profile": {
        if (profile) {
          return { kind, profile };
        }
        if (!canPrompt()) {
          throw usageError(
            "--credential-source profile requires --profile when not running in a terminal.",
          );
        }
        if (profiles.length === 0) {
          throw usageError(
            "No profiles found in your AWS config or credentials files.",
          );
        }
        return { kind, profile: await promptProfile(profiles, awsConfig) };
      }
      case "role": {
        if (roleToAssume) {
          return { kind, roleToAssume };
        }
        if (!canPrompt()) {
          throw usageError(
            "--credential-source role requires --role-to-assume when not running in a terminal.",
          );
        }
        return { kind, roleToAssume: await promptRoleArn() };
      }
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

  async #resolveRegions(
    credentialSource: CredentialSource,
    defaultRegion: string,
  ): Promise<string[]> {
    if (this.#regions.values.length > 0) {
      return [...this.#regions.values];
    }
    if (!canPrompt()) {
      return [defaultRegion];
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
    try {
      const callerArn = await getCallerArn(credentials, defaultRegion);
      progress.succeed(`Authenticated as ${callerArn}`);
    } catch (err) {
      progress.fail(
        `Could not authenticate using ${describeCredentialSource(
          credentialSource,
        )}`,
      );
      throw usageError(errorMessage(err));
    }

    progress.update("Listing regions…");
    const availableRegions = await listEnabledRegions(
      credentials,
      defaultRegion,
    ).catch(() => []);
    progress.stop();

    if (availableRegions.length === 0) {
      return promptRegionsFreeform(defaultRegion);
    }
    return promptRegions(availableRegions, defaultRegion);
  }

  async #scanAndGraph(
    credentialSource: CredentialSource,
    defaultRegion: string,
    regions: string[],
  ): Promise<void> {
    const outputDirectory = resolve(this.#outputDirectory.value as string);
    mkdirSync(outputDirectory, { recursive: true });
    const logPath = join(outputDirectory, LOG_FILE);
    const logStream = createWriteStream(logPath, { flags: "w" });

    const progress = new ProgressLine();
    progress.log(
      `Using ${describeCredentialSource(
        credentialSource,
      )} · regions: ${regions.join(", ")}`,
    );

    // Everything the SDK and scanners log goes to the log file rather than the terminal.
    const restoreConsole = redirectConsole(logStream);
    const renderScanProgress = createScanProgressRenderer(progress);
    const startedAt = Date.now();
    try {
      progress.update("Connecting to AWS…");
      const connector = buildFsConnector(outputDirectory, {
        createTargetDirectory: true,
      });
      const scanMetadata = await this.infrascanClient.performScan(
        resolveCredentialProvider(credentialSource, ROLE_SESSION_NAME),
        connector,
        {
          regions,
          defaultRegion,
          onProgress: (event) => {
            if (event.type === "regions-resolved") {
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
      writeScanMetadata(outputDirectory, [scanMetadata]);
      progress.succeed(
        `Scanned ${scanMetadata.regions.length} region(s) in ${formatDuration(
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
      progress.log(
        `View it with: infrascan render --input ${displayPath(
          visualPath,
        )} --browser`,
      );
    } catch (err) {
      logStream.write(
        `${new Date().toISOString()} ERROR ${
          err instanceof Error ? err.stack : String(err)
        }\n`,
      );
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
