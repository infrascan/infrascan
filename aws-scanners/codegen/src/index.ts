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

function getServiceClient(scannerDefinition: BaseScannerDefinition): string {
  return `${scannerDefinition.clientKey}Client`;
}

/**
 * Declare function to create a client to be passed to the getters for this service
 * Example:
 * ```ts
 * function getClient(credentials: AwsCredentialIdentityProvider, region: string): LambdaClient {
 *  return new LambdaClient({ credentials, region });
 * }
 * ```
 */
function declareClientBuilder(scannerDefinition: BaseScannerDefinition, writer: CodeBlockWriter): CodeBlockWriter {
  return writer.writeLine(`function getClient(credentials: AwsCredentialIdentityProvider, region: string): ${getServiceClient(scannerDefinition)} {`)
    .tab()
    .write(`return new ${getServiceClient(scannerDefinition)}({ credentials, region });`)
    .newLine()
    .writeLine('}\n');
}

function formatNodesForExport(scannerDefinition: BaseScannerDefinition): string | undefined {
  return scannerDefinition.nodes?.map((nodeSelector) => `"${nodeSelector}"`).join(',');
}

function formatEdgesForExport(scannerDefinition: BaseScannerDefinition): string | undefined {
  return scannerDefinition.edges?.map((edgeSelector) => JSON.stringify(edgeSelector, undefined, 2)).join(',');
}

/**
 * Implements an index file for the scanner which exposes its interface
 * @param scannerDefinition 
 * @param project 
 * @param config 
 * @returns {SourceFile} Implementation of an index file to expose the service scanner
 */
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
        .writeLine(`import { ${getServiceClient(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .writeLine(`import { ${scannerGetterImports} } from "./generated/getters";`)
        .writeLine(`import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";`)
        .writeLine(`import type { ServiceModule } from "@infrascan/shared-types";`);
      const fileWithClient = declareClientBuilder(scannerDefinition, fileWithImports);
      return fileWithClient.writeLine(`const ${scannerDefinition.clientKey}Scanner: ServiceModule<${getServiceClient(scannerDefinition)}> = {`)
        .writeLine(`\tprovider: "${scannerDefinition.provider ?? "aws"}",`)
        .writeLine(`\tservice: "${scannerDefinition.service}",`)
        .writeLine(`\tkey: "${scannerDefinition.key}",`)
        .writeLine(`\tgetClient,`)
        .writeLine(`\tcallPerRegion: ${scannerDefinition.isGlobal ? false : true},`)
        .writeLine(`\tgetters: [${scannerGetterImports}],`)
        .conditionalWriteLine(hasNodes, `\tnodes: [${formatNodesForExport(scannerDefinition)}],`)
        .conditionalWriteLine(hasEdges, `\tedges: [${formatEdgesForExport(scannerDefinition)}],`)
        .writeLine('}')
        .newLine()
        .writeLine(`export default ${scannerDefinition.clientKey}Scanner;`);
    },
    { overwrite: config.overwrite }
  );
}

type Commands = {
  command: string;
  input: string;
  output: string;
};

function getCommandTypesForServiceGetter(getter: BaseGetter): Commands {
  return {
    command: `${getter.fn}Command`,
    input: `${getter.fn}CommandInput`,
    output: `${getter.fn}CommandOutput`
  };
}

function declareGetter(scannerDefinition: BaseScannerDefinition, getter: BaseGetter, sourceFile: CodeBlockWriter) {
  const commandTypes = getCommandTypesForServiceGetter(getter);

  const hasParameters = getter.parameters != null;
  const hasPaginationTokens = getter.paginationToken != null;

  return sourceFile.write(`export async function ${getFunctionNameForGetter(getter)}(client: ${getServiceClient(scannerDefinition)}, stateConnector: Connector, account: string, region: string): Promise<void> {`)
    .writeLine(`const state: GenericState[] = [];`)
    .writeLine("try {")
    // TODO: handle verbose logging correctly in generated code
    .writeLine(`\tconsole.log("${scannerDefinition.service} ${getFunctionNameForGetter(getter)}");`)
    .conditionalWriteLine(hasParameters, `\tconst resolvers = ${JSON.stringify(getter.parameters)};`)
    .conditionalWriteLine(hasParameters, `\tconst parameterQueue = await resolveFunctionCallParameters(account, region, resolvers, stateConnector) as ${commandTypes.input}[];`)
    .conditionalWriteLine(hasParameters, `\tfor(const parameters of parameterQueue) {`)
    .conditionalWriteLine(hasPaginationTokens, `\t\tlet pagingToken: string | undefined = undefined;`)
    .conditionalWriteLine(hasPaginationTokens, "\t\tdo {")
    .conditionalWriteLine(!hasParameters,`\t\t\tconst preparedParams: ${commandTypes.input} = {};`)
    .conditionalWriteLine(hasParameters, `\t\t\tconst preparedParams: ${commandTypes.input} = parameters;`)
    .conditionalWriteLine(hasPaginationTokens, `\t\t\tpreparedParams["${getter.paginationToken?.request}"] = pagingToken;`)
    .writeLine(`\t\t\tconst cmd = new ${commandTypes.command}(preparedParams);`)
    .writeLine(`\t\t\tconst result: ${commandTypes.output} = await client.send(cmd);`)
    .writeLine(`\t\t\tstate.push({ _metadata: { account, region }, _parameters: preparedParams, _result: result })`)
    .conditionalWriteLine(hasPaginationTokens, `\t\t\tpagingToken = result["${getter.paginationToken?.response}"];`)
    .conditionalWriteLine(hasPaginationTokens, `\t\t} while(pagingToken != null);`)
    // close outer for loop for parameterised scanners
    .conditionalWriteLine(hasParameters, "\t\t}")
    .writeLine("\t} catch(err: any) {")
      // TODO: proper error handling
    .writeLine("\t\tif(err?.retryable) {")
    .writeLine(`\t\t\tconsole.log("Encountered retryable error", err);`)
    .writeLine(`\t\t} else {`)
    .writeLine(`\t\t\tconsole.log("Encountered unretryable error", err);`)
    .writeLine("\t\t}")
    .writeLine("\t}")
    .writeLine(`\tawait stateConnector.onServiceScanCompleteCallback(account, region, "${scannerDefinition.clientKey}", "${getFunctionNameForGetter(getter)}", state);`)
    .writeLine("}")
    .newLine();
}

export default async function generateScanner(scannerDefinition: BaseScannerDefinition, config: CodegenConfig) {
  const project = new Project();

  const getters = project.createSourceFile(
    join(config.basePath, "generated/getters.ts"),
    (writer) => {
      const hasParameterisedGetter = scannerDefinition.getters.some((getter) => getter.parameters != null);
      
      // Get all of the `Command` types required for this scanner
      const getterImports = scannerDefinition.getters.map(getCommandTypesForServiceGetter);
      // Then split between `XXXCommand` (used as a Class) and `XXXCommandInput/Output` types (used as types)
      const getterCommands = getterImports.map((types) => types.command).join(', ');
      const getterCommandTypes = getterImports.map((types) => `${types.input}, ${types.output}`).join(', ');

      const sourceWriter = writer.writeLine(`import { ${getServiceClient(scannerDefinition)}, ${getterCommands} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .conditionalWriteLine(hasParameterisedGetter, 'import { resolveFunctionCallParameters } from "@infrascan/core";')
        .writeLine(`import type { Connector, GenericState } from "@infrascan/shared-types";`)
        .writeLine(`import type { ${getterCommandTypes} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .newLine();
      scannerDefinition.getters.forEach((getter) => declareGetter(scannerDefinition, getter, sourceWriter));
    },
    { overwrite: config.overwrite },
  );

  await getters.save();
  const indexFile = createModuleExport(scannerDefinition, project, config);
  await indexFile.save();
}