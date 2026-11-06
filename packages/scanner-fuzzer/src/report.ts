import { SEVERITY_ORDER } from "./findings";
import type { Finding, Severity } from "./findings";
import type { FuzzReport } from "./fuzzer";

export interface ReportOptions {
  /**
   * Only include findings at least this severe.
   */
  minSeverity?: Severity;
  /**
   * Scanner selection to include in reproduction commands.
   */
  scannerArgs?: string[];
  /**
   * Include stack frames.
   */
  verbose?: boolean;
}

export function filterFindings(
  findings: Finding[],
  minSeverity: Severity = "warning",
): Finding[] {
  return findings.filter(
    (finding) =>
      SEVERITY_ORDER[finding.severity] <= SEVERITY_ORDER[minSeverity],
  );
}

/**
 * The command that replays the iteration a finding was first seen in.
 * Responses depend on the scanner selection, so it is part of the command.
 */
export function reproCommand(
  seed: number,
  iteration: number,
  scannerArgs: string[] = [],
): string {
  return [
    "infrascan-fuzz",
    `--seed ${seed}`,
    `--iteration ${iteration}`,
    ...scannerArgs.map((scanner) => `--scanner ${scanner}`),
  ].join(" ");
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { fatal: 0, crash: 0, warning: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function formatText(
  report: FuzzReport,
  { minSeverity, scannerArgs, verbose }: ReportOptions = {},
): string {
  const findings = filterFindings(report.findings, minSeverity);
  const lines: string[] = [];
  for (const finding of findings) {
    lines.push(
      `[${finding.severity}] ${finding.stage} (${finding.scanner}) x${finding.count}`,
      `    ${finding.message}`,
    );
    if (finding.location != null) {
      lines.push(`    at ${finding.location}`);
    }
    if (verbose && finding.stack != null) {
      lines.push(...finding.stack.slice(1).map((frame) => `       ${frame}`));
    }
    lines.push(
      `    repro: ${reproCommand(report.seed, finding.iteration, scannerArgs)}`,
      "",
    );
  }
  const counts = countBySeverity(findings);
  lines.push(
    `${findings.length} distinct findings (${counts.fatal} fatal, ${counts.crash} crash, ${counts.warning} warning)`,
    `${report.iterations.length} iterations, ${report.apiCalls} API calls, ${
      report.scanners.length
    } scanners, seed ${report.seed}, ${(report.durationMs / 1000).toFixed(1)}s`,
  );
  return lines.join("\n");
}

export function formatJson(
  report: FuzzReport,
  { minSeverity, scannerArgs }: ReportOptions = {},
): string {
  const findings = filterFindings(report.findings, minSeverity).map(
    (finding) => ({
      ...finding,
      repro: reproCommand(report.seed, finding.iteration, scannerArgs),
    }),
  );
  return JSON.stringify({ ...report, findings }, null, 2);
}
