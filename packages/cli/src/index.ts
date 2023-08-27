#!/usr/bin/env node

import { CommandLineParser } from "@rushstack/ts-command-line";
import GraphCmd from "./commands/graph";
import ScanCmd from "./commands/scan";

class InfrascanCLI extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: "infrascan",
      toolDescription:
        'The "infrascan" tool helps you stay on top of your cloud infrastructure.',
    });

    this.addAction(new ScanCmd());
    this.addAction(new GraphCmd());
  }

  protected onExecute(): Promise<void> {
    return super.onExecute();
  }
}

const commandLine = new InfrascanCLI();
commandLine.execute();
