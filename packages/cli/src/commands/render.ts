import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CommandLineAction,
  CommandLineStringParameter,
  CommandLineFlagParameter,
} from "@rushstack/ts-command-line";
import { renderFile } from "ejs";
import open from "open";

import type { Graph } from "@infrascan/shared-types";
import { resolveStateDirectory } from "../snapshot";
import { GRAPH_FILE } from "../store";

export default class RenderCmd extends CommandLineAction {
  #graphPath: CommandLineStringParameter;

  #outputPath: CommandLineStringParameter;

  #launchBrowser: CommandLineFlagParameter;

  #scanId: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: "render",
      summary: "Renders your Infrascan graph in your browser",
      documentation:
        "Loads in the output of a graph command, and render it in a static webpage.\n\nNote: this will only work with Cytoscape compatible graphs.",
    });
  }

  protected onDefineParameters(): void {
    this.#graphPath = this.defineStringParameter({
      parameterLongName: "--input",
      parameterShortName: "-i",
      argumentName: "PATH_TO_GRAPH",
      description:
        "Location to read graph data from. This should be the path to the file output by the graph command. When omitted, the latest graphed scan in the local infrascan state directory is used.",
    });
    this.#scanId = this.defineStringParameter({
      parameterLongName: "--scan",
      argumentName: "SCAN_ID",
      description:
        "Render the graph of a specific scan from the local state directory, by id or unique id prefix.",
    });
    this.#outputPath = this.defineStringParameter({
      parameterLongName: "--output",
      parameterShortName: "-o",
      argumentName: "OUTPUT_PATH_FOR_WEBPAGE",
      description:
        "Location to save the generated graph page to. Defaults to a temp directory.",
    });
    this.#launchBrowser = this.defineFlagParameter({
      parameterLongName: "--browser",
      description:
        "Launches the default browser to view the generated graph view.",
    });
  }

  protected async onExecute(): Promise<void> {
    const graphPath =
      this.#graphPath.value ??
      join(
        await resolveStateDirectory({
          scanId: this.#scanId.value,
          requireGraph: true,
        }),
        GRAPH_FILE,
      );
    const graphText = this.readGraphData(graphPath);
    if (graphText == null) {
      process.exit(1);
    }

    const graph = JSON.parse(graphText) as Graph;

    // prepare page
    const populatedGraphView = await renderFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "templates",
        "index.html.ejs",
      ),
      {
        graphData: JSON.stringify(graph),
      },
    );

    // save page
    let output =
      this.#outputPath.value != null
        ? this.#outputPath.value
        : mkdtempSync(`${tmpdir()}${sep}infrascan-generated-`);
    if (!output.endsWith(".html")) {
      output = `${output}${sep}index.html`;
    }
    writeFileSync(output, populatedGraphView);
    console.log(`Graph view written to ${output}`);

    // launch browser
    if (this.#launchBrowser.value) {
      await open(output, { wait: false });
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private readGraphData(graphPath: string): string | null {
    try {
      return readFileSync(graphPath, "utf8");
    } catch (err: unknown) {
      const errMessage =
        err instanceof Error && "message" in err
          ? err.message
          : "unknown error occurred";
      console.error(
        `Failed to read graph data from: ${graphPath}. ${errMessage}`,
      );
      return null;
    }
  }
}
