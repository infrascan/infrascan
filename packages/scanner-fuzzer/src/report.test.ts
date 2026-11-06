import t from "tap";
import type { FuzzReport } from "./fuzzer";
import {
  countBySeverity,
  filterFindings,
  formatJson,
  formatText,
  reproCommand,
} from "./report";

const report: FuzzReport = {
  seed: 5,
  iterations: [0, 1],
  scanners: ["SQS"],
  apiCalls: 10,
  durationMs: 1200,
  findings: [
    {
      severity: "fatal",
      stage: "sdk:generateGraph",
      scanner: "sdk",
      message: "boom",
      location: "x (a.js:1:1)",
      stack: ["x (a.js:1:1)", "y (b.js:2:2)"],
      count: 2,
      iteration: 1,
    },
    {
      severity: "warning",
      stage: "sdk:log",
      scanner: "sdk",
      message: "meh",
      count: 1,
      iteration: 0,
    },
  ],
};

t.test(
  "repro commands replay the iteration with the same scanners",
  async ({ equal }) => {
    equal(reproCommand(5, 1), "infrascan-fuzz --seed 5 --iteration 1");
    equal(
      reproCommand(5, 1, ["sqs", "SNS"]),
      "infrascan-fuzz --seed 5 --iteration 1 --scanner sqs --scanner SNS",
    );
  },
);

t.test("findings are filtered by minimum severity", async ({ equal }) => {
  equal(filterFindings(report.findings, "fatal").length, 1);
  equal(filterFindings(report.findings, "crash").length, 1);
  equal(filterFindings(report.findings, "warning").length, 2);
  equal(countBySeverity(report.findings).warning, 1);
});

t.test(
  "text output lists findings and a summary",
  async ({ match, notMatch }) => {
    const text = formatText(report, { scannerArgs: ["sqs"] });
    match(text, /\[fatal\] sdk:generateGraph \(sdk\) x2/);
    match(text, /repro: infrascan-fuzz --seed 5 --iteration 1 --scanner sqs/);
    match(text, /2 distinct findings \(1 fatal, 0 crash, 1 warning\)/);
    notMatch(text, /y \(b\.js/);
    match(formatText(report, { verbose: true }), /y \(b\.js:2:2\)/);
  },
);

t.test(
  "json output is parseable and includes repro commands",
  async ({ equal }) => {
    const parsed = JSON.parse(formatJson(report, { minSeverity: "fatal" }));
    equal(parsed.findings.length, 1);
    equal(parsed.findings[0].repro, "infrascan-fuzz --seed 5 --iteration 1");
    equal(parsed.seed, 5);
  },
);
