/**
 * How bad a finding is, from the perspective of someone running a scan.
 *
 * - `fatal`: the real SDK call (`performScan` or `generateGraph`) threw, so the user gets no result at all.
 * - `crash`: scanner code threw. The fuzzer isolates it so the run can continue; whether it aborts a real run
 *   depends on how the SDK handles that extension point.
 * - `warning`: nothing threw, but data was lost or malformed (the SDK logged an error, or a node/edge was invalid).
 */
export type Severity = "fatal" | "crash" | "warning";

export const SEVERITY_ORDER: Record<Severity, number> = {
  fatal: 0,
  crash: 1,
  warning: 2,
};

export interface FindingInput {
  severity: Severity;
  /**
   * Where in the pipeline the failure happened, e.g. `entity:lambda.$graph` or `sdk:generateGraph`.
   */
  stage: string;
  /**
   * The scanner key, or `sdk` for failures outside any scanner.
   */
  scanner: string;
  error: unknown;
}

export interface Finding {
  severity: Severity;
  stage: string;
  scanner: string;
  message: string;
  /**
   * The first stack frame inside Infrascan code, when the error has a stack.
   */
  location?: string;
  stack?: string[];
  count: number;
  /**
   * The first iteration this was seen in, used to reproduce it.
   */
  iteration: number;
}

/**
 * Replace the run-specific parts of a message (ARNs, identifiers, numbers) so
 * that the same failure seen with different data is grouped together.
 */
export function normalizeMessage(message: string): string {
  return (
    message
      .replace(/'[^']*'/g, "'<value>'")
      .replace(/"[^"]*"/g, '"<value>"')
      .split(" ")
      // Any token holding a digit, colon or slash is data (an ARN, an id, a
      // count, a path); words, and `null` / `undefined`, are kept.
      .map((token) => {
        // Keep sentence punctuation (`role:`, `graph.`) out of the decision
        const trailing = /[.,;:]$/.test(token) ? token.slice(-1) : "";
        const word = trailing !== "" ? token.slice(0, -1) : token;
        return /[\d:/]/.test(word) ? `<ref>${trailing}` : token;
      })
      .join(" ")
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }
  return String(error).split("\n")[0];
}

const FRAME = /^\s*at\s+/;

/**
 * The stack frames within Infrascan's own code (scanners, SDK, core), skipping
 * node internals, third party dependencies, and the fuzzer itself.
 */
export function relevantFrames(error: unknown, root?: string): string[] {
  if (!(error instanceof Error) || error.stack == null) {
    return [];
  }
  return error.stack
    .split("\n")
    .filter((line) => FRAME.test(line))
    .map((line) => line.replace(FRAME, "").trim())
    .filter(
      (frame) =>
        // Frames without a file (e.g. `Array.filter (<anonymous>)`) don't locate anything
        frame.includes("/") &&
        !frame.includes("node_modules") &&
        !frame.includes("node:") &&
        !frame.includes("scanner-fuzzer"),
    )
    .map((frame) => (root != null ? frame.split(`${root}/`).join("") : frame));
}

export class FindingCollector {
  private readonly findings = new Map<string, Finding>();

  private iteration = 0;

  private readonly root?: string;

  /**
   * @param root Repository root, stripped from stack frames for readability.
   */
  constructor(root?: string) {
    this.root = root;
  }

  startIteration(iteration: number) {
    this.iteration = iteration;
  }

  record({ severity, stage, scanner, error }: FindingInput) {
    const message = errorMessage(error);
    // Warnings describe bad output rather than a throw, so where the fuzzer
    // noticed them says nothing about their cause.
    const stack =
      severity === "warning" ? [] : relevantFrames(error, this.root);
    const location = stack[0];
    const key = [
      severity,
      stage,
      scanner,
      location ?? "",
      normalizeMessage(message),
    ].join("|");
    const existing = this.findings.get(key);
    if (existing != null) {
      existing.count += 1;
      return;
    }
    this.findings.set(key, {
      severity,
      stage,
      scanner,
      message,
      location,
      stack: stack.length > 0 ? stack.slice(0, 5) : undefined,
      count: 1,
      iteration: this.iteration,
    });
  }

  /**
   * All findings, most severe first, then most frequent.
   */
  list(): Finding[] {
    return [...this.findings.values()].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.count - a.count ||
        a.stage.localeCompare(b.stage),
    );
  }

  get size(): number {
    return this.findings.size;
  }
}
