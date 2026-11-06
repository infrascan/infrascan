import t from "tap";
import { buildFixtureScanner } from "./__fixtures__/scanner";
import { FindingCollector } from "./findings";
import { instrumentScanner } from "./instrument";

const state = {
  _metadata: { account: "0", region: "us-east-1", timestamp: 1 },
  _parameters: {},
  _result: { Functions: [{ FunctionName: "a" }, { FunctionName: "b" }] },
};

t.test(
  "component failures are recorded and the value dropped",
  async ({ equal, same }) => {
    const findings = new FindingCollector();
    const scanner = instrumentScanner(
      buildFixtureScanner({ component: true }),
      findings,
    );
    const values = scanner.entities![0].translate(state as any);
    same(values, []);
    const [finding] = findings.list();
    equal(finding.severity, "crash");
    equal(finding.stage, "entity:fixture-function.resource");
    equal(finding.scanner, "Fixture");
    equal(finding.count, 2);
  },
);

t.test("healthy values pass through untouched", async ({ equal }) => {
  const findings = new FindingCollector();
  const scanner = instrumentScanner(buildFixtureScanner(), findings);
  equal(scanner.entities![0].translate(state as any).length, 2);
  equal(findings.size, 0);
});

t.test("getter and edge failures are contained", async ({ same, resolves }) => {
  const findings = new FindingCollector();
  const scanner = instrumentScanner(
    buildFixtureScanner({ getter: true, edges: true }),
    findings,
  );
  const fakeClient = { send: async () => ({ Functions: [] }) };
  const connector = { onServiceScanCompleteCallback: async () => {} } as any;
  await resolves(
    scanner.getters[0](fakeClient, connector, {
      account: "0",
      region: "us-east-1",
    }),
  );
  same(await scanner.getEdges!(connector), []);
  same(
    findings
      .list()
      .map(({ stage }) => stage)
      .sort(),
    ["getEdges", "getter:ListFunctions"],
  );
});

t.test("getter names are preserved", async ({ equal }) => {
  const scanner = instrumentScanner(
    buildFixtureScanner(),
    new FindingCollector(),
  );
  equal(scanner.getters[0].name, "ListFunctions");
});

t.test("invalid outputs are reported as warnings", async ({ equal }) => {
  const findings = new FindingCollector();
  const scanner = instrumentScanner(
    buildFixtureScanner({ nullRole: true }),
    findings,
  );
  await scanner.getIamRoles!({} as any);
  const [finding] = findings.list();
  equal(finding.severity, "warning");
  equal(finding.message, "returned a role with roleArn null");
});

t.test(
  "without isolation, failures propagate after being recorded",
  async ({ throws, equal }) => {
    const findings = new FindingCollector();
    const scanner = instrumentScanner(
      buildFixtureScanner({ component: true }),
      findings,
      {
        isolate: false,
      },
    );
    throws(() => scanner.entities![0].translate(state as any), TypeError);
    equal(findings.size, 1);
  },
);
