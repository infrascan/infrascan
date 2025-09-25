import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { ScanMetadata } from "@infrascan/sdk";
import {
  CommandLineAction,
  CommandLineChoiceParameter,
  CommandLineStringParameter,
} from "@rushstack/ts-command-line";
import buildFsConnector from "@infrascan/fs-connector";
import Infrascan from "@infrascan/sdk";
import { serializeGraph as serializeVisualGraph } from "@infrascan/cytoscape-serializer";
import { serializeGraph as serializeInformationalGraph } from "@infrascan/informational-serializer";

function readScanMetadata(outputPath: string): ScanMetadata[] {
  const scanMetadata = readFileSync(
    join(resolve(outputPath), "metadata.json"),
    "utf8",
  );
  return JSON.parse(scanMetadata);
}

function writeGraphOutput<T>(outputPath: string, graphState: T) {
  writeFileSync(
    join(resolve(outputPath), "graph.json"),
    JSON.stringify(graphState),
  );
}

export default class GraphCmd extends CommandLineAction {
  private _outputDirectory: CommandLineStringParameter;

  private _serializer: CommandLineChoiceParameter;

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
    this._serializer = this.defineChoiceParameter({
      required: false,
      parameterLongName: "--serializer",
      description:
        "Choice of graph serializer. Visual will output a cytoscape compatible graph intended for visual consumption. Informational will preserve the maximum amount of structured data to explore in other formats.",
      alternatives: ["visual", "informational"],
    });
  }

  protected async onExecute(): Promise<void> {
    const scanMetadata = readScanMetadata(
      this._outputDirectory.value as string,
    );
    const connector = buildFsConnector(this._outputDirectory.value as string);

    let nServicesScanned = 0;
    this.infrascanClient.registerPlugin({
      event: "onServiceComplete",
      id: "countServicesScanner",
      handler: () => {
        nServicesScanned += 1;
      },
    });

    const serializeGraph =
      this._serializer.value === "informational"
        ? serializeInformationalGraph
        : serializeVisualGraph;

    const graphData = await this.infrascanClient.generateGraph<
      ReturnType<typeof serializeGraph>
    >(scanMetadata, connector, serializeGraph);
    console.log(
      `Graph Complete. Found resources in ${nServicesScanned} services.`,
    );
    return writeGraphOutput(this._outputDirectory.value as string, graphData);
  }
}
