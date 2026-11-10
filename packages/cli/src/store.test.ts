import t from "tap";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GRAPH_FILE,
  LocalStore,
  STORE_VERSION,
  generateScanId,
  resolveConfigPath,
  resolveStateDir,
} from "./store";
import { resolveScanConfig, saveConfig } from "./config";

const metadata = [
  {
    account: "000000000000",
    regions: ["us-east-1"],
    defaultRegion: "us-east-1",
  },
];

t.test("state dir resolution precedence", (tap) => {
  const home = "/home/test";
  tap.equal(
    resolveStateDir({ env: {}, platform: "linux", home }),
    "/home/test/.local/state/infrascan",
  );
  tap.equal(
    resolveStateDir({
      env: { XDG_STATE_HOME: "/xdg" },
      platform: "linux",
      home,
    }),
    "/xdg/infrascan",
  );
  tap.equal(
    resolveStateDir({
      env: { XDG_STATE_HOME: "/xdg", INFRASCAN_HOME: "/custom" },
      platform: "linux",
      home,
    }),
    "/custom/state",
  );
  tap.equal(
    resolveConfigPath({ env: {}, platform: "darwin", home }),
    "/home/test/.config/infrascan/config.json",
  );
  tap.equal(
    resolveConfigPath({
      env: { INFRASCAN_HOME: "/custom" },
      platform: "linux",
      home,
    }),
    "/custom/config.json",
  );
  tap.end();
});

t.test("scan ids sort chronologically", (tap) => {
  const earlier = generateScanId(new Date("2026-01-01T00:00:00.000Z"));
  const later = generateScanId(new Date("2026-01-01T00:00:01.000Z"));
  tap.match(earlier, /^20260101T000000000Z-[0-9a-f]{4}$/);
  tap.ok(earlier < later);
  const sameMs = new Date("2027-01-01T00:00:00.000Z");
  tap.ok(generateScanId(sameMs) < generateScanId(sameMs), "monotonic");
  tap.end();
});

t.test("store initialises with a manifest", async (tap) => {
  const root = tap.testdir();
  await LocalStore.open(root);
  const manifest = JSON.parse(await readFile(join(root, "store.json"), "utf8"));
  tap.equal(manifest.version, STORE_VERSION);
});

t.test("store refuses state from a newer version", async (tap) => {
  const root = tap.testdir({
    "store.json": JSON.stringify({ version: STORE_VERSION + 1, createdAt: "" }),
  });
  await tap.rejects(LocalStore.open(root), /newer version of infrascan/);
});

t.test(
  "scans accumulate and the latest complete scan is resolved",
  async (tap) => {
    const store = await LocalStore.open(tap.testdir());
    const first = await store.beginScan([{ profile: "a" }]);
    await store.completeScan(first.id, metadata);
    const second = await store.beginScan([{ profile: "b" }]);
    await store.failScan(second.id, new Error("boom"));

    const scans = await store.listScans();
    tap.equal(scans.length, 2);
    tap.equal(scans[0].id, second.id, "newest first");
    tap.equal(scans[1].status, "complete");
    tap.same(scans[1].config, [{ profile: "a" }], "records the config used");
    tap.equal(scans[0].error, "boom");

    const latest = await store.resolveScan();
    tap.equal(latest?.id, first.id, "skips failed scans");
    tap.ok(
      existsSync(join(first.path, "metadata.json")),
      "writes legacy metadata",
    );

    tap.equal((await store.resolveScan(first.id.slice(0, 20)))?.id, first.id);
    tap.equal(
      await store.resolveScan(undefined, { requireGraph: true }),
      undefined,
    );
    await writeFile(join(first.path, GRAPH_FILE), "[]");
    tap.equal(
      (await store.resolveScan(undefined, { requireGraph: true }))?.id,
      first.id,
    );
  },
);

t.test("prune keeps the most recent completed scans", async (tap) => {
  const store = await LocalStore.open(tap.testdir());
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const scan = await store.beginScan([]);
    await store.completeScan(scan.id, metadata);
    ids.push(scan.id);
  }
  const failed = await store.beginScan([]);
  await store.failScan(failed.id, "nope");
  const inProgress = await store.beginScan([]);

  const removed = await store.prune(1);
  tap.same(removed.sort(), [ids[0], ids[1], failed.id].sort());
  const remaining = (await store.listScans()).map((s) => s.id);
  tap.same(remaining.sort(), [ids[2], inProgress.id].sort());
});

t.test("legacy state directories can be imported", async (tap) => {
  const dir = tap.testdir({
    legacy: {
      "metadata.json": JSON.stringify(metadata),
      "000000000000-us-east-1-lambda-ListFunctions.json": "[]",
      "graph.json": "[]",
    },
    empty: {},
  });
  const store = await LocalStore.open(join(dir, "store"));
  const scan = await store.importScan(join(dir, "legacy"));
  tap.equal(scan.status, "complete");
  tap.ok(scan.hasGraph);
  tap.ok(
    existsSync(
      join(scan.path, "000000000000-us-east-1-lambda-ListFunctions.json"),
    ),
  );
  tap.same(scan.accounts, metadata);
  await tap.rejects(
    store.importScan(join(dir, "empty")),
    /missing metadata.json/,
  );
});

t.test("config resolution reuses saved config", async (tap) => {
  const home = tap.testdir({
    "explicit.json": JSON.stringify([{ profile: "x" }]),
  });
  const ctx = {
    env: { INFRASCAN_HOME: home },
    platform: "linux" as const,
    home,
  };

  tap.same(resolveScanConfig(undefined, "eu-west-1", ctx), {
    config: [{ defaultRegion: "eu-west-1" }],
    source: "defaults",
  });

  const explicit = resolveScanConfig(
    join(home, "explicit.json"),
    undefined,
    ctx,
  );
  tap.same(explicit.config, [{ profile: "x" }]);

  const saved = await saveConfig(explicit.config, ctx);
  tap.equal(saved, join(home, "config.json"));
  tap.same(resolveScanConfig(undefined, undefined, ctx), {
    config: [{ profile: "x" }],
    source: saved,
  });

  await mkdir(join(home, "bad"));
  await writeFile(
    join(home, "bad", "c.json"),
    JSON.stringify({ profile: "x" }),
  );
  tap.throws(
    () => resolveScanConfig(join(home, "bad", "c.json"), undefined, ctx),
    /expected an array/,
  );
});
