import { join } from "path";
import { CodeBlockWriter, Project, SourceFile } from "ts-morph";

import type { BaseScannerDefinition, BaseGetter } from "@infrascan/shared-types";

export type CodegenConfig = {
  basePath: string;
  overwrite: boolean;
};

function getFunctionNameForGetter(getter: BaseGetter): string {
  return getter.id ?? getter.fn;
}

function declareClientBuilder(scannerDefinition: BaseScannerDefinition, writer: CodeBlockWriter): CodeBlockWriter {
  return writer.writeLine(`function getClient(credentials: AwsCredentialIdentityProvider, region: string): ${scannerDefinition.clientKey}.${scannerDefinition.clientKey}Client {`)
    .tab()
    .write(`return new ${scannerDefinition.clientKey}.${scannerDefinition.clientKey}Client({ credentials, region });`)
    .newLine()
    .writeLine('}\n');
}

function createModuleExport(scannerDefinition: BaseScannerDefinition, project: Project, config: CodegenConfig): SourceFile {
  const scannerExportPath: string = join(config.basePath, "index.ts");
  
  const scannerGetterNames = scannerDefinition.getters.map(getFunctionNameForGetter);
  const scannerGetterImports = scannerGetterNames.join(', ');

  const hasNodes = (scannerDefinition.nodes?.length ?? 0) > 0;
  const hasEdges = (scannerDefinition.edges?.length ?? 0) > 0;

  return project.createSourceFile(
    scannerExportPath, 
    (writer) => {
      const fileWithImports = writer
        .writeLine(`import * as ${scannerDefinition.clientKey} from "@aws-sdk/client-${scannerDefinition.service}";`)
        .writeLine(`import { ${scannerGetterImports} } from "./generated/getters.ts";`)
        .conditionalWriteLine(hasNodes, () => `import { generateNodes } from "./generated/nodes.ts";\n`)
        .conditionalWriteLine(hasEdges, () => `import { generateEdges } from "./generated/edges.ts";\n`)
        .writeLine(`import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";`)
        .newLine();
      const fileWithClient = declareClientBuilder(scannerDefinition, fileWithImports);
      return fileWithClient.writeLine(`export default {`)
        .writeLine(`\tprovider: "${scannerDefinition.provider ?? "aws"}",`)
        .writeLine(`\tservice: "${scannerDefinition.service}",`)
        .writeLine(`\tkey: "${scannerDefinition.key}",`)
        .writeLine(`\tgetClient,`)
        .writeLine(`\tcallPerRegion: ${scannerDefinition.isGlobal ? false : true},`)
        .writeLine(`\tgetters: [${scannerGetterImports}],`)
        .conditionalWriteLine(hasNodes, "\tnodes: generateNodes,")
        .conditionalWriteLine(hasEdges, "\tedges: generateEdges,")
        .writeLine('}');
    },
    { overwrite: config.overwrite }
  );
}

function declareGetter(scannerDefinition: BaseScannerDefinition, getter: BaseGetter, sourceFile: CodeBlockWriter) {
  const commandTypes = {
    command: `${scannerDefinition.clientKey}.${getter.fn}Command`,
    input: `${scannerDefinition.clientKey}.${getter.fn}CommandInput`,
    output: `${scannerDefinition.clientKey}.${getter.fn}CommandOutput`
  };
  return sourceFile.write(`export async function ${getFunctionNameForGetter(getter)}(client: ${scannerDefinition.clientKey}.${scannerDefinition.clientKey}Client, stateConnector: Connector, account: string, region: string): Promise<void> {`)
    .writeLine(`const state: GenericState[] = [];`)
    .writeLine("try {")
    // TODO: handle verbose logging correctly in generated code
    // TODO: handle all parameters
    .writeLine(`\tconsole.log("${scannerDefinition.service} ${getFunctionNameForGetter(getter)}");`)
    .conditionalWriteLine(getter.parameters != null, `\tconst resolvers = ${JSON.stringify(getter.parameters)};`)
    .conditionalWriteLine(getter.parameters != null, `\tconst parameterQueue: ${commandTypes.input}[] = await resolveFunctionCallParameters(account, region, resolvers, stateConnector.resolveStateForServiceFunction);`)
    .conditionalWriteLine(getter.parameters != null, `\tfor(const parameters of parameterQueue) {`)
    .conditionalWriteLine(getter.paginationToken != null, `\t\tlet pagingToken: string | undefined = undefined;`)
    .conditionalWriteLine(getter.paginationToken != null, "\t\tdo {")
    .conditionalWriteLine(getter.parameters == null,`\t\t\tconst preparedParams: ${commandTypes.input} = {};`)
    .conditionalWriteLine(getter.parameters != null, `\t\t\tconst preparedParams: ${commandTypes.input} = parameters;`)
    .conditionalWriteLine(getter.paginationToken != null, `\t\t\tpreparedParams["${getter.paginationToken?.request}"] = pagingToken;`)
    .writeLine(`\t\t\tconst cmd = new ${commandTypes.command}(preparedParams);`)
    .writeLine(`\t\t\tconst result: ${commandTypes.output} = await client.send(cmd);`)
    // TODO: handle formatting
    .writeLine(`\t\t\tstate.push({ _metadata: { account, region }, _parameters: preparedParams, _result: result })`)
    .conditionalWriteLine(getter.paginationToken != null, `\t\t\tpagingToken = result["${getter.paginationToken?.response}"];`)
    .conditionalWriteLine(getter.paginationToken != null, `\t\t} while(pagingToken != null);`)
    // close outer for loop for parameterised scanners
    .conditionalWriteLine(getter.parameters != null, "\t\t}")
    .writeLine("\t} catch(err: any) {")
      // TODO: error handling
    .writeLine("\t\tif(err?.retryable) {")
    .writeLine(`\t\t\tconsole.log("Encountered retryable error", err);`)
    .writeLine(`\t\t} else {`)
    .writeLine(`\t\t\tconsole.log("Encountered unretryable error", err);`)
    .writeLine("\t\t}")
    .writeLine("\t}")
    .writeLine(`\tawait stateConnector.onServiceScanCompleteCallback(account, region, "${scannerDefinition.clientKey}", "${getFunctionNameForGetter(getter)}", state);`)
    .writeLine("}");

}

export default async function generateScanner(scannerDefinition: BaseScannerDefinition, config: CodegenConfig) {
  const project = new Project();

  const getters = project.createSourceFile(
    join(config.basePath, "generated/getters.ts"),
    (writer) => {
      const sourceWriter = writer.writeLine(`import * as ${scannerDefinition.clientKey} from "@aws-sdk/client-${scannerDefinition.service}";`)
        .writeLine(`import type { Connector, GenericState } from "@infrascan/shared-types";`);
      scannerDefinition.getters.forEach((getter) => declareGetter(scannerDefinition, getter, sourceWriter));
    },
    { overwrite: config.overwrite },
  );

  await getters.save();
  const indexFile = createModuleExport(scannerDefinition, project, config);
  await indexFile.save();
}