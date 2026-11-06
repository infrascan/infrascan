#!/usr/bin/env node
import { writeFile } from "fs/promises";
import { parseArgs } from "util";
import { SEVERITY_ORDER } from "./findings";
import type { Severity } from "./findings";
import { runFuzzer } from "./fuzzer";
import { filterFindings, formatJson, formatText } from "./report";
import {
  UnknownScannerError,
  resolveAllScanners,
  selectScanners,
} from "./scanners";

const USAGE = `Usage: infrascan-fuzz [command] [options]

Drives the Infrascan SDK and AWS scanners with AWS responses generated from the
SDK's own API schemas, and reports runtime failures.

Commands:
  run                  Run the fuzzer (default)
  list                 List the scanners that can be fuzzed

Options:
  -n, --iterations <n>   Iterations to run (default: 200)
  -s, --seed <n>         Seed for the run (default: 1)
  -i, --iteration <n>    Run only this iteration of the seeded run, to reproduce a finding
      --scanner <name>   Scanner key or service to fuzz, repeatable (default: all)
      --propagate        Let scanner failures propagate as they would in a real run,
                         instead of containing them so the run can continue
      --call-budget <n>  Max API calls per iteration before reporting a pagination loop (default: 5000)
      --min-severity <s> Lowest severity to report: fatal, crash, warning (default: warning)
      --fail-on <s>      Exit non-zero if a finding at least this severe is found:
                         fatal, crash, warning, none (default: crash)
      --format <f>       Output format: text, json (default: text)
  -o, --output <file>    Write the report to a file instead of stdout
  -v, --verbose          Include stack frames in text output
  -q, --quiet            Don't report progress
  -h, --help             Show this message
`;

const SEVERITIES = Object.keys(SEVERITY_ORDER) as Severity[];

class UsageError extends Error {}

function parseInteger(name: string, value: string | undefined) {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(
      `--${name} must be a non-negative integer, got "${value}"`,
    );
  }
  return parsed;
}

function parseSeverity<T extends string>(
  name: string,
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new UsageError(
      `--${name} must be one of ${allowed.join(", ")}, got "${value}"`,
    );
  }
  return value as T;
}

function listScanners() {
  for (const scanner of resolveAllScanners()) {
    const scope = scanner.callPerRegion ? "regional" : "global";
    console.log(
      `${scanner.key.padEnd(24)} ${scanner.service.padEnd(24)} ${scope}`,
    );
  }
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      iterations: { type: "string", short: "n", default: "200" },
      seed: { type: "string", short: "s", default: "1" },
      iteration: { type: "string", short: "i" },
      scanner: { type: "string", multiple: true, default: [] },
      propagate: { type: "boolean", default: false },
      "call-budget": { type: "string" },
      "min-severity": { type: "string", default: "warning" },
      "fail-on": { type: "string", default: "crash" },
      format: { type: "string", default: "text" },
      output: { type: "string", short: "o" },
      verbose: { type: "boolean", short: "v", default: false },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0] ?? "run";
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (command === "list") {
    listScanners();
    return 0;
  }
  if (command !== "run") {
    throw new UsageError(`Unknown command "${command}"`);
  }

  const minSeverity = parseSeverity(
    "min-severity",
    values["min-severity"],
    SEVERITIES,
  );
  const failOn = parseSeverity("fail-on", values["fail-on"], [
    ...SEVERITIES,
    "none",
  ] as const);
  const format = parseSeverity("format", values.format, [
    "text",
    "json",
  ] as const);
  const scannerArgs = values.scanner;
  // Resolve the selection up front so a typo fails before any work is done
  const scanners = selectScanners(resolveAllScanners(), scannerArgs);

  const showProgress = !values.quiet && process.stderr.isTTY;
  const report = await runFuzzer({
    iterations: parseInteger("iterations", values.iterations),
    seed: parseInteger("seed", values.seed),
    iteration: parseInteger("iteration", values.iteration),
    callBudget: parseInteger("call-budget", values["call-budget"]),
    scannerModules: scanners,
    isolate: !values.propagate,
    onIteration: showProgress
      ? (completed, total) => {
          process.stderr.write(`\rIteration ${completed}/${total}`);
          if (completed === total) {
            process.stderr.write("\n");
          }
        }
      : undefined,
  });

  const reportOptions = {
    minSeverity,
    scannerArgs,
    verbose: values.verbose,
  };
  const output =
    format === "json"
      ? formatJson(report, reportOptions)
      : formatText(report, reportOptions);
  if (values.output != null) {
    await writeFile(values.output, `${output}\n`);
    if (!values.quiet) {
      console.error(`Report written to ${values.output}`);
    }
  } else {
    console.log(output);
  }

  if (failOn === "none") {
    return 0;
  }
  return filterFindings(report.findings, failOn).length > 0 ? 1 : 0;
}

function isUsageError(err: unknown): err is Error {
  return (
    err instanceof UsageError ||
    err instanceof UnknownScannerError ||
    // Thrown by util.parseArgs for unknown or malformed options
    (typeof (err as { code?: unknown })?.code === "string" &&
      (err as { code: string }).code.startsWith("ERR_PARSE_ARGS"))
  );
}

const argv = process.argv.slice(2);
// Package managers may forward a literal `--` separator (`pnpm fuzz -- -n 10`)
main(argv[0] === "--" ? argv.slice(1) : argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (isUsageError(err)) {
      console.error(`${err.message}\n\nRun infrascan-fuzz --help for usage.`);
    } else {
      console.error(err);
    }
    process.exitCode = 2;
  },
);
