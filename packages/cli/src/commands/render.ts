import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CommandLineAction,
  CommandLineStringParameter,
  CommandLineFlagParameter,
} from "@rushstack/ts-command-line";
import { renderFile } from "ejs";
import open from "open";

import type { Graph } from "@infrascan/shared-types";

export default class RenderCmd extends CommandLineAction {
  #graphPath: CommandLineStringParameter;
  #outputPath: CommandLineStringParameter;
  #launchBrowser: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: "render",
      summary: "Renders your Infrascan graph in your browser",
      documentation:
        "Loads in the output of a graph command, and render it in a static webpage.",
    });
  }

  protected onDefineParameters(): void {
    this.#graphPath = this.defineStringParameter({
      parameterLongName: "--input",
      parameterShortName: "-i",
      argumentName: "PATH_TO_GRAPH",
      description:
        "Location to read graph data from. This should be the path to the file output by the graph command.",
      defaultValue: "./state/graph.json",
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
    const graphText = this.readGraphData();
    if (graphText == null) {
      return process.exit(1);
    }

    const graph = JSON.parse(graphText) as Graph;

    // prepare page
    const populatedGraphView = await renderFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "./templates/index.html.ejs",
      ),
      {
        graphData: JSON.stringify(graph),
      },
    );

    // save page
    let output =
      this.#outputPath.value != null
        ? this.#outputPath.value
        : mkdtempSync("infrascan-generated");
    if (!output.endsWith(".html")) {
      output = `${output}/index.html`;
    }
    writeFileSync(output, populatedGraphView);
    console.log(`Graph view written to ${output}`);

    // launch browser
    if (this.#launchBrowser.value) {
      await open(output, { wait: false });
    }
  }

  private readGraphData(): string | null {
    try {
      return readFileSync(this.#graphPath.value as string, "utf8");
    } catch (err: unknown) {
      console.error(`Failed to read graph data from: ${this.#graphPath.value}`);
      return null;
    }
  }
}
