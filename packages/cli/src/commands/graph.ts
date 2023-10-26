import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type {
  GraphElement,
  GraphNode,
} from "@infrascan/shared-types";
import type { ScanMetadata } from "@infrascan/sdk";
import {
  CommandLineAction,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import buildFsConnector from "@infrascan/fs-connector";
import Infrascan from "@infrascan/sdk";


function readScanMetadata(outputPath: string): ScanMetadata[] {
  const scanMetadata = readFileSync(
    join(resolve(outputPath), "metadata.json"),
    "utf8",
  );
  return JSON.parse(scanMetadata);
}

function writeGraphOutput(outputPath: string, graphState: GraphElement[]) {
  writeFileSync(
    join(resolve(outputPath), "graph.json"),
    JSON.stringify(graphState),
  );
}

export default class GraphCmd extends CommandLineAction {
  private _outputDirectory: CommandLineStringParameter;

  private infrascanClient: Infrascan;

  public constructor(infrascanClient: Infrascan) {
    super({
      actionName: "graph",
      summary: "Graphs a set of AWS accounts which have been scanned",
      documentation:
        "Reads in the output of an account scan, and generates an infrastructure diagram from the output. The graph is saved to the local filesystem.",
    });
    this.infrascanClient = infrascanClient;
  }

  protected onDefineParameters(): void {
    this._outputDirectory = this.defineStringParameter({
      parameterLongName: "--input",
      parameterShortName: "-i",
      argumentName: "PATH_TO_STATE",
      description:
        "Location to read scan state from. This should be the same as the directory given to the scan command.",
      defaultValue: "./state",
    });
  }

  protected async onExecute(): Promise<void> {
    const scanMetadata = readScanMetadata(
      this._outputDirectory.value as string,
    );
    const connector = buildFsConnector(this._outputDirectory.value as string);
    const graphData = await this.infrascanClient.generateGraph(
      scanMetadata,
      connector,
    );
    const graphNodes = graphData.filter(
      (elem) => elem.group === "nodes",
    ) as GraphNode[];
    const mappedServices = graphNodes.reduce((acc, node) => {
      if (node?.data?.service) {
        acc.add(node.data.service);
      }
      return acc;
    }, new Set());
    console.log(
      `Graph Complete. Found resources in ${mappedServices.size} services.`,
    );
    return writeGraphOutput(this._outputDirectory.value as string, graphData);
  }
}
