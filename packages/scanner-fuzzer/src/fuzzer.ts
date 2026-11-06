import { existsSync } from "fs";
import { dirname, join } from "path";
import Infrascan from "@infrascan/sdk";
import { serializeGraph as serializeCytoscape } from "@infrascan/cytoscape-serializer";
import { serializeGraph as serializeInformational } from "@infrascan/informational-serializer";
import type { AwsCredentialIdentity } from "@aws-sdk/types";
import type { Graph } from "@infrascan/shared-types";
import { createMemoryConnector } from "./connector";
import { captureConsole } from "./console";
import { FindingCollector } from "./findings";
import type { Finding } from "./findings";
import { ResponseGenerator } from "./generator";
import { instrumentScanner } from "./instrument";
import { randomProfile } from "./profile";
import { Random, deriveSeed } from "./random";
import { resolveAllScanners, selectScanners } from "./scanners";
import type { AwsScanner } from "./scanners";
import { TransportInterceptor } from "./interceptor";
import { FuzzTransport } from "./transport";
import { ValueFactory } from "./values";
import type { AccountContext } from "./values";

export interface FuzzOptions {
  /**
   * Number of iterations to run. Ignored when `iteration` is set.
   */
  iterations?: number;
  /**
   * Seed for the run. The same seed, scanners, and iteration always produce the same responses.
   */
  seed?: number;
  /**
   * Run a single iteration of the seeded run, to reproduce a finding.
   */
  iteration?: number;
  /**
   * Scanner keys or service names to fuzz. Defaults to every AWS scanner.
   */
  scanners?: string[];
  /**
   * Provide the scanners directly instead of resolving them, e.g. for testing the fuzzer itself.
   */
  scannerModules?: AwsScanner[];
  /**
   * Contain scanner failures so the run continues (default). Disable to see which failures abort a real run.
   */
  isolate?: boolean;
  /**
   * Maximum API calls per iteration before a getter is considered to be looping.
   */
  callBudget?: number;
  account?: string;
  region?: string;
  /**
   * Stripped from stack frames in findings. Defaults to the workspace root.
   */
  root?: string;
  /**
   * Called after each iteration, e.g. to report progress.
   */
  onIteration?: (completed: number, total: number) => void;
}

export interface FuzzReport {
  seed: number;
  /**
   * The iterations that ran, in order.
   */
  iterations: number[];
  scanners: string[];
  findings: Finding[];
  apiCalls: number;
  durationMs: number;
}

const DEFAULT_ACCOUNT = "000000000000";
const DEFAULT_REGION = "us-east-1";

// Never used: every request is answered by the fuzzer before signing.
const credentials: AwsCredentialIdentity = {
  accessKeyId: "AKIAFUZZER",
  secretAccessKey: "fuzzer",
};
const credentialProvider = () => async () => credentials;

function serializeAll(graph: Graph) {
  const serialized = {
    informational: serializeInformational(graph),
    cytoscape: serializeCytoscape(graph),
  };
  // Serialized graphs are written out as JSON, so they must survive it.
  JSON.stringify(serialized, (_, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
  return serialized;
}

/**
 * The monorepo root, found by walking up to the pnpm workspace file. Used to
 * shorten paths in findings, falls back to the working directory.
 */
export function findWorkspaceRoot(from = process.cwd()): string {
  let dir = from;
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return from;
    }
    dir = parent;
  }
  return dir;
}

export async function runFuzzer(
  options: FuzzOptions = {},
): Promise<FuzzReport> {
  const started = Date.now();
  const seed = options.seed ?? 1;
  const iterations =
    options.iteration != null
      ? [options.iteration]
      : Array.from({ length: options.iterations ?? 100 }, (_, idx) => idx);
  const context: AccountContext = {
    account: options.account ?? DEFAULT_ACCOUNT,
    region: options.region ?? DEFAULT_REGION,
    partition: "aws",
  };
  const scanners =
    options.scannerModules ??
    selectScanners(resolveAllScanners(), options.scanners);
  const findings = new FindingCollector(options.root ?? findWorkspaceRoot());

  const interceptor = new TransportInterceptor();
  interceptor.install(
    scanners.map((scanner) =>
      scanner.getClient(credentialProvider(), context),
    ) as object[],
  );

  let apiCalls = 0;
  try {
    for (const [completed, iteration] of iterations.entries()) {
      findings.startIteration(iteration);
      const random = new Random(deriveSeed(seed, iteration));
      const profile = randomProfile(random);
      const generator = new ResponseGenerator(
        new ValueFactory(random, profile, context),
      );
      const transport = new FuzzTransport(
        generator,
        random,
        profile.errorRate,
        options.callBudget,
      );
      interceptor.use(transport);

      const infrascan = new Infrascan();
      for (const scanner of scanners) {
        infrascan.registerScanner(
          instrumentScanner(scanner, findings, { isolate: options.isolate }),
        );
      }

      const connector = createMemoryConnector();
      const logged = await captureConsole(async () => {
        let scanMetadata;
        try {
          scanMetadata = await infrascan.performScan(
            credentialProvider,
            connector,
            { regions: [context.region], defaultRegion: context.region },
          );
        } catch (err: unknown) {
          findings.record({
            severity: "fatal",
            stage: "sdk:performScan",
            scanner: "sdk",
            error: err,
          });
          return;
        }
        try {
          await infrascan.generateGraph(scanMetadata, connector, serializeAll);
        } catch (err: unknown) {
          findings.record({
            severity: "fatal",
            stage: "sdk:generateGraph",
            scanner: "sdk",
            error: err,
          });
        }
      });
      for (const message of logged) {
        findings.record({
          severity: "warning",
          stage: "sdk:log",
          scanner: "sdk",
          error: message,
        });
      }

      apiCalls += [...transport.calls.values()].reduce(
        (total, count) => total + count,
        0,
      );
      options.onIteration?.(completed + 1, iterations.length);
    }
  } finally {
    interceptor.restore();
  }

  return {
    seed,
    iterations,
    scanners: scanners.map((scanner) => scanner.key),
    findings: findings.list(),
    apiCalls,
    durationMs: Date.now() - started,
  };
}
