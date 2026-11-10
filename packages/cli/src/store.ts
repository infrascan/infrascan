/**
 * Local-first state store for the Infrascan CLI.
 *
 * State lives in a standard per-user location rather than wherever the CLI happens to be run from:
 *
 * ```
 * <state root>/                 e.g. ~/.local/state/infrascan
 *   store.json                  { version, createdAt } — the on-disk layout version, used for migrations
 *   scans/
 *     <scan id>/                sortable, timestamp based id e.g. 20261110T093000123Z-3f9a
 *       scan.json               ScanRecord: status, timings, config used, account metadata
 *       metadata.json           ScanMetadata[] — identical to the legacy `-o` directory format
 *       <account>-<region>-<service>-<fn>.json
 *       graph.json              written by `infrascan graph`
 * ```
 *
 * Every scan gets its own snapshot directory, so state accumulates over time instead of being
 * overwritten. Each snapshot directory is a valid legacy state directory, so it can be handed to
 * `--input`/`--output` flags, the fs-connector, or older versions of the CLI unchanged.
 */
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { ScanMetadata } from "@infrascan/sdk";
import type { ScanConfig } from "./config";

/**
 * The current version of the on-disk layout. Bump this and append a migration to {@link MIGRATIONS}
 * whenever the layout changes in a way older readers would not understand.
 */
export const STORE_VERSION = 1;

export const SCAN_RECORD_FILE = "scan.json";
export const SCAN_METADATA_FILE = "metadata.json";
export const GRAPH_FILE = "graph.json";
export const CONFIG_FILE = "config.json";
const STORE_MANIFEST_FILE = "store.json";
const SCANS_DIR = "scans";

type Env = Record<string, string | undefined>;

export type PathContext = {
  env?: Env;
  platform?: NodeJS.Platform;
  home?: string;
};

function withDefaults(ctx: PathContext): Required<PathContext> {
  return {
    env: ctx.env ?? process.env,
    platform: ctx.platform ?? process.platform,
    home: ctx.home ?? homedir(),
  };
}

/**
 * Resolve the directory Infrascan stores scan state in.
 *
 * Precedence: `INFRASCAN_HOME/state` → `XDG_STATE_HOME/infrascan` → `%LOCALAPPDATA%\infrascan\state` (Windows)
 * → `~/.local/state/infrascan`.
 */
export function resolveStateDir(ctx: PathContext = {}): string {
  const { env, platform, home } = withDefaults(ctx);
  if (env.INFRASCAN_HOME) return resolve(env.INFRASCAN_HOME, "state");
  if (env.XDG_STATE_HOME) return resolve(env.XDG_STATE_HOME, "infrascan");
  if (platform === "win32" && env.LOCALAPPDATA) {
    return resolve(env.LOCALAPPDATA, "infrascan", "state");
  }
  return resolve(home, ".local", "state", "infrascan");
}

/**
 * Resolve the directory Infrascan reads user config from.
 *
 * Precedence: `INFRASCAN_HOME` → `XDG_CONFIG_HOME/infrascan` → `%APPDATA%\infrascan` (Windows)
 * → `~/.config/infrascan`.
 */
export function resolveConfigDir(ctx: PathContext = {}): string {
  const { env, platform, home } = withDefaults(ctx);
  if (env.INFRASCAN_HOME) return resolve(env.INFRASCAN_HOME);
  if (env.XDG_CONFIG_HOME) return resolve(env.XDG_CONFIG_HOME, "infrascan");
  if (platform === "win32" && env.APPDATA) {
    return resolve(env.APPDATA, "infrascan");
  }
  return resolve(home, ".config", "infrascan");
}

export function resolveConfigPath(ctx: PathContext = {}): string {
  return join(resolveConfigDir(ctx), CONFIG_FILE);
}

export type ScanStatus = "in-progress" | "complete" | "failed";

/**
 * Describes a single scan snapshot. Fields are only ever added to this record; readers must tolerate
 * unknown fields so that older CLIs can still list newer snapshots.
 */
export type ScanRecord = {
  id: string;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  /** The scan config the snapshot was produced from, so it can be re-run or audited later. */
  config: ScanConfig;
  /** Metadata for each account scanned, populated when the scan completes. */
  accounts: ScanMetadata[];
  /** Populated when a scan fails. */
  error?: string;
  /** Set when the snapshot was imported from an existing state directory. */
  importedFrom?: string;
};

export type ScanSummary = ScanRecord & {
  path: string;
  hasGraph: boolean;
};

type StoreManifest = {
  version: number;
  createdAt: string;
};

type Migration = (root: string) => Promise<void>;

/**
 * Migrations from version N to N+1, indexed by N. e.g. MIGRATIONS[1] upgrades a v1 store to v2.
 * There are none yet — this is the hook for evolving the layout without stranding existing state.
 */
const MIGRATIONS: Record<number, Migration> = {};

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as { code?: string })?.code === "ENOENT") return undefined;
    throw err;
  }
}

/** Write via a temp file + rename so a crash never leaves a half-written JSON document behind. */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(value, undefined, 2), "utf8");
  await rename(tmp, path);
}

let lastIdTime = 0;

/**
 * Sortable, filesystem-safe and collision resistant id for a new scan, e.g. `20261110T093000123Z-3f9a`.
 * Ids are strictly increasing within a process so snapshots always sort in creation order.
 */
export function generateScanId(now: Date = new Date()): string {
  const time = Math.max(now.getTime(), lastIdTime + 1);
  lastIdTime = time;
  const timestamp = new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "$1Z");
  return `${timestamp}-${randomBytes(2).toString("hex")}`;
}

export class LocalStore {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  /**
   * Open (initialising or migrating as needed) the store at `root`, defaulting to the standard state directory.
   */
  static async open(root: string = resolveStateDir()): Promise<LocalStore> {
    const store = new LocalStore(resolve(root));
    await store.prepare();
    return store;
  }

  get scansDir(): string {
    return join(this.root, SCANS_DIR);
  }

  scanPath(id: string): string {
    return join(this.scansDir, id);
  }

  private async prepare(): Promise<void> {
    await mkdir(this.scansDir, { recursive: true });
    const manifestPath = join(this.root, STORE_MANIFEST_FILE);
    const manifest = await readJson<StoreManifest>(manifestPath);
    if (manifest == null) {
      await writeJsonAtomic(manifestPath, {
        version: STORE_VERSION,
        createdAt: new Date().toISOString(),
      } satisfies StoreManifest);
      return;
    }
    if (manifest.version > STORE_VERSION) {
      throw new Error(
        `The state in ${this.root} was written by a newer version of infrascan (store v${manifest.version}, this CLI supports v${STORE_VERSION}). Upgrade the CLI or point INFRASCAN_HOME elsewhere.`,
      );
    }
    for (let v = manifest.version; v < STORE_VERSION; v += 1) {
      const migrate = MIGRATIONS[v];
      if (migrate == null) {
        throw new Error(`No migration available from store v${v}.`);
      }
      await migrate(this.root);
      await writeJsonAtomic(manifestPath, { ...manifest, version: v + 1 });
    }
  }

  /** Create a new, in-progress snapshot directory for a scan. */
  async beginScan(config: ScanConfig): Promise<ScanSummary> {
    const id = generateScanId();
    const record: ScanRecord = {
      id,
      status: "in-progress",
      startedAt: new Date().toISOString(),
      config,
      accounts: [],
    };
    await mkdir(this.scanPath(id), { recursive: true });
    await this.writeRecord(record);
    return { ...record, path: this.scanPath(id), hasGraph: false };
  }

  async completeScan(id: string, accounts: ScanMetadata[]): Promise<void> {
    const record = await this.requireRecord(id);
    await writeJsonAtomic(
      join(this.scanPath(id), SCAN_METADATA_FILE),
      accounts,
    );
    await this.writeRecord({
      ...record,
      status: "complete",
      completedAt: new Date().toISOString(),
      accounts,
    });
  }

  async failScan(id: string, error: unknown): Promise<void> {
    const record = await this.requireRecord(id);
    await this.writeRecord({
      ...record,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Copy an existing state directory (e.g. one created with `infrascan scan -o ./state`) into the store as a
   * completed snapshot.
   */
  async importScan(sourceDir: string): Promise<ScanSummary> {
    const source = resolve(sourceDir);
    const accounts = await readJson<ScanMetadata[]>(
      join(source, SCAN_METADATA_FILE),
    );
    if (accounts == null) {
      throw new Error(
        `${source} does not look like an infrascan state directory (missing ${SCAN_METADATA_FILE}).`,
      );
    }
    const id = generateScanId();
    const target = this.scanPath(id);
    await cp(source, target, { recursive: true });
    const now = new Date().toISOString();
    const record: ScanRecord = {
      id,
      status: "complete",
      startedAt: now,
      completedAt: now,
      config: [],
      accounts,
      importedFrom: source,
    };
    await this.writeRecord(record);
    return {
      ...record,
      path: target,
      hasGraph: existsSync(join(target, GRAPH_FILE)),
    };
  }

  /** All snapshots, newest first. Directories without a readable record are skipped. */
  async listScans(): Promise<ScanSummary[]> {
    const entries = await readdir(this.scansDir, { withFileTypes: true });
    const ids = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    const summaries = await Promise.all(ids.map((id) => this.getScan(id)));
    return summaries.filter((s): s is ScanSummary => s != null);
  }

  async getScan(id: string): Promise<ScanSummary | undefined> {
    const path = this.scanPath(id);
    const record = await readJson<ScanRecord>(join(path, SCAN_RECORD_FILE));
    if (record == null) return undefined;
    return { ...record, path, hasGraph: existsSync(join(path, GRAPH_FILE)) };
  }

  /**
   * Find a snapshot by full id or unique prefix, or the most recent completed one when no id is given.
   * Optionally require that the snapshot has a graph.
   */
  async resolveScan(
    idOrPrefix?: string,
    opts: { requireGraph?: boolean } = {},
  ): Promise<ScanSummary | undefined> {
    const scans = await this.listScans();
    if (idOrPrefix == null) {
      return scans.find(
        (s) => s.status === "complete" && (!opts.requireGraph || s.hasGraph),
      );
    }
    const matches = scans.filter((s) => s.id.startsWith(idOrPrefix));
    if (matches.length > 1) {
      throw new Error(
        `Scan id "${idOrPrefix}" is ambiguous, matches: ${matches
          .map((s) => s.id)
          .join(", ")}`,
      );
    }
    return matches[0];
  }

  /**
   * Delete all but the `keep` most recent completed snapshots, along with any failed snapshots.
   * In-progress snapshots are left alone as they may belong to a running scan.
   */
  async prune(keep: number): Promise<string[]> {
    const scans = await this.listScans();
    const completed = scans.filter((s) => s.status === "complete");
    const toRemove = [
      ...completed.slice(Math.max(keep, 0)),
      ...scans.filter((s) => s.status === "failed"),
    ];
    for (const scan of toRemove) {
      await rm(scan.path, { recursive: true, force: true });
    }
    return toRemove.map((s) => s.id);
  }

  private async writeRecord(record: ScanRecord): Promise<void> {
    await writeJsonAtomic(
      join(this.scanPath(record.id), SCAN_RECORD_FILE),
      record,
    );
  }

  private async requireRecord(id: string): Promise<ScanRecord> {
    const record = await readJson<ScanRecord>(
      join(this.scanPath(id), SCAN_RECORD_FILE),
    );
    if (record == null) throw new Error(`Unknown scan: ${id}`);
    return record;
  }
}
