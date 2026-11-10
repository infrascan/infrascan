import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { GRAPH_FILE, LocalStore, SCAN_METADATA_FILE } from "./store";

/** The directory the CLI wrote to before local-first state existed. */
export const LEGACY_STATE_DIR = "./state";

/**
 * Work out which state directory a read command (graph, render) should use.
 *
 * - An explicit directory always wins.
 * - Otherwise the requested snapshot (by id or prefix) or the latest completed snapshot in the local store.
 * - If the store has nothing usable but a legacy `./state` directory exists, fall back to it so existing
 *   workflows keep working.
 */
export async function resolveStateDirectory(opts: {
  explicitDir?: string;
  scanId?: string;
  requireGraph?: boolean;
}): Promise<string> {
  if (opts.explicitDir != null) return resolve(opts.explicitDir);

  const store = await LocalStore.open();
  const snapshot = await store.resolveScan(opts.scanId, {
    requireGraph: opts.requireGraph,
  });
  if (snapshot != null) {
    if (snapshot.status !== "complete") {
      console.warn(`Warning: scan ${snapshot.id} is ${snapshot.status}.`);
    }
    return snapshot.path;
  }
  if (opts.scanId != null) {
    throw new Error(`No scan found matching "${opts.scanId}".`);
  }

  const legacyMarker = opts.requireGraph ? GRAPH_FILE : SCAN_METADATA_FILE;
  if (existsSync(join(LEGACY_STATE_DIR, legacyMarker))) {
    console.warn(
      `No scans found in ${store.root}, falling back to ${LEGACY_STATE_DIR}. Run \`infrascan state --import ${LEGACY_STATE_DIR}\` to move it into the local store.`,
    );
    return resolve(LEGACY_STATE_DIR);
  }
  throw new Error(
    opts.requireGraph
      ? "No graphed scans found. Run `infrascan scan` then `infrascan graph` first."
      : "No completed scans found. Run `infrascan scan` first.",
  );
}
