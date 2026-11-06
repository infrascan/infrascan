import t from "tap";
import { FindingCollector, normalizeMessage, relevantFrames } from "./findings";

t.test(
  "messages are normalized so the same failure groups together",
  async ({ equal }) => {
    equal(
      normalizeMessage(
        "Node arn:aws:iam::000000000000:role/abc12345 not found in graph.",
      ),
      normalizeMessage("Node vpc-zz99yy11 not found in graph."),
    );
    equal(
      normalizeMessage("Cannot read properties of undefined (reading 'split')"),
      "Cannot read properties of undefined (reading '<value>')",
    );
    // null / undefined carry meaning and are kept
    equal(normalizeMessage("scanning role: null"), "scanning role: null");
  },
);

t.test("stack frames are limited to Infrascan code", async ({ same }) => {
  const error = new Error("boom");
  error.stack = [
    "Error: boom",
    "    at $graph (/repo/aws-scanners/sqs/dist/index.js:10:5)",
    "    at Array.filter (<anonymous>)",
    "    at next (/repo/node_modules/jmespath/jmespath.js:1:1)",
    "    at instrument (/repo/packages/scanner-fuzzer/dist/index.js:1:1)",
    "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
    "    at generateGraph (/repo/packages/sdk/dist/index.js:20:1)",
  ].join("\n");
  same(relevantFrames(error, "/repo"), [
    "$graph (aws-scanners/sqs/dist/index.js:10:5)",
    "generateGraph (packages/sdk/dist/index.js:20:1)",
  ]);
  same(relevantFrames("not an error"), []);
});

t.test(
  "findings are grouped, counted, and keep their first iteration",
  async ({ equal, same }) => {
    const collector = new FindingCollector();
    collector.startIteration(3);
    collector.record({
      severity: "crash",
      stage: "getEdges",
      scanner: "SQS",
      error: new TypeError("Cannot read properties of undefined (reading 'a')"),
    });
    collector.startIteration(9);
    collector.record({
      severity: "crash",
      stage: "getEdges",
      scanner: "SQS",
      error: new TypeError("Cannot read properties of undefined (reading 'b')"),
    });
    collector.record({
      severity: "fatal",
      stage: "sdk:generateGraph",
      scanner: "sdk",
      error: new Error("x"),
    });
    collector.record({
      severity: "warning",
      stage: "sdk:log",
      scanner: "sdk",
      error: "logged",
    });

    const findings = collector.list();
    equal(collector.size, 3);
    same(
      findings.map(({ severity }) => severity),
      ["fatal", "crash", "warning"],
    );
    equal(findings[1].count, 2);
    equal(findings[1].iteration, 3);
  },
);

t.test("warnings carry no stack location", async ({ equal }) => {
  const collector = new FindingCollector();
  collector.record({
    severity: "warning",
    stage: "getIamRoles",
    scanner: "ECS",
    error: new Error("bad role"),
  });
  equal(collector.list()[0].location, undefined);
});
