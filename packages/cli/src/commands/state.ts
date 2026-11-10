import { existsSync } from "node:fs";
import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import { getConfig, saveConfig } from "../config";
import {
  LocalStore,
  resolveConfigPath,
  resolveStateDir,
  type ScanSummary,
} from "../store";

function describeScan(scan: ScanSummary): string {
  const accounts = scan.accounts.map((a) => a.account).join(", ") || "-";
  const regions =
    [...new Set(scan.accounts.flatMap((a) => a.regions))].join(", ") || "-";
  const flags = [
    scan.hasGraph ? "graphed" : null,
    scan.importedFrom ? "imported" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `${scan.id}  ${scan.status.padEnd(11)}${flags ? ` (${flags})` : ""}`,
    `    accounts: ${accounts}`,
    `    regions:  ${regions}`,
    ...(scan.error ? [`    error:    ${scan.error}`] : []),
  ].join("\n");
}

export default class StateCmd extends CommandLineAction {
  #json: CommandLineFlagParameter;

  #paths: CommandLineFlagParameter;

  #prune: CommandLineIntegerParameter;

  #import: CommandLineStringParameter;

  #importConfig: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: "state",
      summary: "Inspect and manage locally stored scans",
      documentation:
        "Infrascan keeps every scan as a snapshot in a standard per-user state directory (override with INFRASCAN_HOME or XDG_STATE_HOME). With no flags, this lists stored scans newest first.",
    });
  }

  protected onDefineParameters(): void {
    this.#json = this.defineFlagParameter({
      parameterLongName: "--json",
      description: "Output as JSON.",
    });
    this.#paths = this.defineFlagParameter({
      parameterLongName: "--paths",
      description: "Print the state directory and config file locations.",
    });
    this.#prune = this.defineIntegerParameter({
      parameterLongName: "--prune",
      argumentName: "KEEP",
      description:
        "Delete all but the KEEP most recent completed scans, along with any failed scans.",
    });
    this.#import = this.defineStringParameter({
      parameterLongName: "--import",
      argumentName: "STATE_DIRECTORY",
      description:
        "Import an existing state directory (e.g. one created with `infrascan scan -o ./state`) as a new snapshot.",
    });
    this.#importConfig = this.defineStringParameter({
      parameterLongName: "--import-config",
      argumentName: "PATH_TO_CONFIG",
      description:
        "Save an existing scan config file as the default config used by `infrascan scan`.",
    });
  }

  protected async onExecute(): Promise<void> {
    if (this.#paths.value) {
      const configPath = resolveConfigPath();
      const paths = {
        state: resolveStateDir(),
        config: configPath,
        configExists: existsSync(configPath),
      };
      if (this.#json.value) {
        console.log(JSON.stringify(paths, undefined, 2));
      } else {
        console.log(`State directory: ${paths.state}`);
        console.log(
          `Config file:     ${paths.config}${
            paths.configExists ? "" : " (not created)"
          }`,
        );
      }
      return;
    }

    if (this.#importConfig.value != null) {
      const config = getConfig(this.#importConfig.value);
      console.log(`Saved config to ${await saveConfig(config)}`);
      return;
    }

    const store = await LocalStore.open();

    if (this.#import.value != null) {
      const scan = await store.importScan(this.#import.value);
      console.log(`Imported ${this.#import.value} as scan ${scan.id}`);
      return;
    }

    if (this.#prune.value != null) {
      const removed = await store.prune(this.#prune.value);
      console.log(
        removed.length > 0
          ? `Removed ${removed.length} scan(s): ${removed.join(", ")}`
          : "Nothing to prune.",
      );
      return;
    }

    const scans = await store.listScans();
    if (this.#json.value) {
      console.log(JSON.stringify(scans, undefined, 2));
      return;
    }
    if (scans.length === 0) {
      console.log(
        `No scans stored in ${store.root} yet. Run \`infrascan scan\`.`,
      );
      return;
    }
    console.log(scans.map(describeScan).join("\n"));
  }
}
