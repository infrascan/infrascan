import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { GraphElement, GraphNode, ScanMetadata, generateGraph } from "@infrascan/sdk";
import { CommandLineAction, CommandLineStringParameter } from '@rushstack/ts-command-line';
import buildFsConnector from '@infrascan/fs-connector';

function readScanMetadata(outputPath: string): ScanMetadata[] {
  const scanMetadata = readFileSync(join(resolve(outputPath), 'metadata.json'), 'utf8');
  return JSON.parse(scanMetadata);
}

function writeGraphOutput(outputPath: string, graphState: GraphElement[]) {
  writeFileSync(join(resolve(outputPath), 'graph.json'), JSON.stringify(graphState));
}

export default class ScanCmd extends CommandLineAction {
  private _outputDirectory: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'graph',
      summary: 'Graphs a set of AWS accounts which have been scanned',
      documentation: 'Reads in the output of an account scan, and generates an infrastructure diagram from the output. The graph is saved to the local filesystem.'
    });
  }

  protected onDefineParameters(): void {
    this._outputDirectory = this.defineStringParameter({
      parameterLongName: '--output',
      parameterShortName: '-o',
      argumentName: 'PATH_TO_STATE_OUTPUT',
      description: 'Location to read scan output from. This should be the same as the directory given to the scan command.',
      defaultValue: './state'
    });
  }

  protected async onExecute(): Promise<void> {
    const scanMetadata = readScanMetadata(this._outputDirectory.value as string);
    const {
      resolveStateForServiceFunction,
      getGlobalStateForServiceFunction
    } = buildFsConnector(this._outputDirectory.value as string);
    
    const graphData = await generateGraph({
      scanMetadata,
      resolveStateForServiceCall: resolveStateForServiceFunction,
      getGlobalStateForServiceAndFunction: getGlobalStateForServiceFunction,
    });
    const graphNodes = graphData.filter((elem) => elem.group === 'nodes') as GraphNode[];
    const mappedServices = graphNodes.reduce((acc, node) => {
      if (node?.data?.service) {
        acc.add(node.data.service);
      }
      return acc;
    }, new Set());
    console.log(
      `Graph Complete. Found resources in ${mappedServices.size} services.`
    );
    return writeGraphOutput(this._outputDirectory.value as string, graphData);
  }
}