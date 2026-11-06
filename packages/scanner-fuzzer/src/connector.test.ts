import t from "tap";
import { createMemoryConnector } from "./connector";

t.test(
  "state is JSON round-tripped like the persistent connectors",
  async ({ same, equal }) => {
    const connector = createMemoryConnector();
    const created = new Date("2026-01-01T00:00:00.000Z");
    await connector.onServiceScanCompleteCallback(
      "1",
      "us-east-1",
      "Svc",
      "Fn",
      [{ created, missing: undefined, big: BigInt(5) }],
    );
    const [state] = await connector.resolveStateForServiceFunction(
      "1",
      "us-east-1",
      "Svc",
      "Fn",
    );
    same(state, { created: created.toISOString(), big: 5 });
    equal("missing" in state, false);
  },
);

t.test("global state spans accounts and regions", async ({ equal, same }) => {
  const connector = createMemoryConnector();
  await connector.onServiceScanCompleteCallback("1", "us-east-1", "Svc", "Fn", [
    1,
  ]);
  await connector.onServiceScanCompleteCallback("2", "eu-west-1", "Svc", "Fn", [
    2,
  ]);
  await connector.onServiceScanCompleteCallback(
    "1",
    "us-east-1",
    "Svc",
    "Other",
    [3],
  );
  same(
    (await connector.getGlobalStateForServiceFunction("Svc", "Fn")).sort(),
    [1, 2],
  );
  same(
    await connector.resolveStateForServiceFunction(
      "3",
      "us-east-1",
      "Svc",
      "Fn",
    ),
    [],
  );
  equal(connector.keys().length, 3);
});
