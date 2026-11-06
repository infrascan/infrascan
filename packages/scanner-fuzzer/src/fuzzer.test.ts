import t from "tap";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { buildFixtureScanner } from "./__fixtures__/scanner";
import { runFuzzer } from "./fuzzer";
import { findSendPrototype } from "./interceptor";

t.test(
  "scanner faults are found through the real SDK pipeline",
  async ({ ok, equal }) => {
    const report = await runFuzzer({
      iterations: 10,
      seed: 3,
      scannerModules: [buildFixtureScanner({ component: true, edges: true })],
    });
    const stages = report.findings.map(({ stage }) => stage);
    ok(stages.includes("entity:fixture-function.resource"));
    ok(stages.includes("getEdges"));
    equal(
      report.findings.filter(({ severity }) => severity === "fatal").length,
      0,
      "isolated failures don't abort the run",
    );
    ok(report.apiCalls > 0);
    equal(report.iterations.length, 10);
  },
);

t.test(
  "without isolation, the same faults abort generateGraph",
  async ({ ok }) => {
    const report = await runFuzzer({
      iterations: 3,
      scannerModules: [buildFixtureScanner({ edges: true })],
      isolate: false,
    });
    ok(
      report.findings.some(
        ({ severity, stage }) =>
          severity === "fatal" && stage === "sdk:generateGraph",
      ),
    );
  },
);

t.test("a healthy scanner produces no crashes", async ({ same }) => {
  const report = await runFuzzer({
    iterations: 10,
    scannerModules: [buildFixtureScanner()],
  });
  same(
    report.findings.filter(({ severity }) => severity !== "warning"),
    [],
  );
});

t.test("runs are reproducible from the seed", async ({ same }) => {
  const run = () =>
    runFuzzer({ iterations: 15, seed: 21, scanners: ["sqs", "sns"] });
  const strip = (report: Awaited<ReturnType<typeof run>>) =>
    report.findings.map(({ stage, message, count, iteration }) => ({
      stage,
      message,
      count,
      iteration,
    }));
  same(strip(await run()), strip(await run()));
});

t.test(
  "a single iteration replays the same findings as in the full run",
  async ({ ok }) => {
    const full = await runFuzzer({
      iterations: 20,
      seed: 4,
      scanners: ["sqs"],
    });
    for (const finding of full.findings) {
      const replay = await runFuzzer({
        seed: 4,
        iteration: finding.iteration,
        scanners: ["sqs"],
      });
      ok(
        replay.findings.some(
          ({ stage, message }) =>
            stage === finding.stage && message === finding.message,
        ),
        `iteration ${finding.iteration} reproduces ${finding.stage}`,
      );
    }
  },
);

t.test("the real scanners can be fuzzed by name", async ({ same, ok }) => {
  const report = await runFuzzer({ iterations: 5, scanners: ["lambda", "s3"] });
  same(report.scanners.sort(), ["Lambda", "S3"]);
  ok(report.apiCalls > 0);
});

t.test(
  "the AWS client transport is restored after a run",
  async ({ equal }) => {
    const proto = findSendPrototype(
      new LambdaClient({
        region: "us-east-1",
        credentials: async () => ({ accessKeyId: "a", secretAccessKey: "b" }),
      }),
    );
    const before = proto.send;
    await runFuzzer({ iterations: 1, scannerModules: [buildFixtureScanner()] });
    equal(proto.send, before);
  },
);
