#!/usr/bin/env node

import Infrascan from "@infrascan/sdk";
import { registerAwsScanners } from "@infrascan/aws";
import { CommandLineParser } from "@rushstack/ts-command-line";
import GraphCmd from "./commands/graph";
import RenderCmd from "./commands/render";
import ScanCmd from "./commands/scan";

class InfrascanCLI extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: "infrascan",
      toolDescription:
        'The "infrascan" tool helps you stay on top of your cloud infrastructure.',
    });

    const infrascanClient = registerAwsScanners(new Infrascan());
    this.addAction(new GraphCmd(infrascanClient));
    this.addAction(new RenderCmd());
    this.addAction(new ScanCmd(infrascanClient));
  }

  protected onExecute(): Promise<void> {
    return super.onExecute();
  }
}

const commandLine = new InfrascanCLI();
commandLine.execute();
