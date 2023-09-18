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

function getServiceClientClass(scannerDefinition: BaseScannerDefinition): string {
  return `${scannerDefinition.clientKey}Client`;
}

function getServiceErrorType(scannerDefinition: BaseScannerDefinition): string {
  return `${scannerDefinition.clientKey}ServiceException`;
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
  return writer.writeLine(`import { ${getServiceClientClass(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}";`)
    .writeLine(`import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";`)
    .newLine()
    .writeLine(`export function getClient(credentials: AwsCredentialIdentityProvider, region: string): ${getServiceClientClass(scannerDefinition)} {`)
    .tab()
    .write(`return new ${getServiceClientClass(scannerDefinition)}({ credentials, region });`)
    .newLine()
    .writeLine('}\n');
}

/**
 * Logs a suggested module export. This should be correct for most generated scanners, but will imports
 * will differ if any step is manually implemented.
 * @param scannerDefinition 
 * @returns {void}
 */
function suggestModuleExport(scannerDefinition: BaseScannerDefinition) {  
  const scannerGetterNames = scannerDefinition.getters.map(getFunctionNameForGetter);
  const scannerGetterImports = scannerGetterNames.join(', ');

  const hasNodes = (scannerDefinition.nodes?.length ?? 0) > 0;
  const hasEdges = (scannerDefinition.edges?.length ?? 0) > 0;

  console.log("The expected export for this scanner is below. It should, at a minimum, serve as a strong starting point.")
  console.log("-----BEGIN EXPECTED EXPORT-----");
  console.log(`import { ${getServiceClientClass(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}"; 
import { getClient } from "./generated/client";
import { ${scannerGetterImports} } from "./generated/getters";
${hasEdges ? `import { getEdges } from "./generated/edges";` : ""}
${hasNodes ? `import { getNodes } from "./generated/nodes";` : ""}
import type { ServiceModule } from "@infrascan/shared-types";

const ${scannerDefinition.clientKey}Scanner: ServiceModule<${getServiceClientClass(scannerDefinition)}> = {
  provider: "${scannerDefinition.provider ?? "aws"}",
  service: "${scannerDefinition.service}",
  key: "${scannerDefinition.key}",
  getClient,
  callPerRegion: ${scannerDefinition.isGlobal ? false : true},
  getters: [${scannerGetterImports}],
  ${hasNodes ? `nodes: getNodes,` : ""}
  ${hasEdges ? `edges: getEdges,` : ""}
};

export default ${scannerDefinition.clientKey}Scanner;`);
console.log("-----END EXPECTED EXPORT-----");
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

function declareNodeSelector(scannerDefinition: BaseScannerDefinition, sourceFile: CodeBlockWriter): CodeBlockWriter {
  const nodes = scannerDefinition.nodes ?? [];
  if(nodes.length === 0) {
    return sourceFile;
  }

  // TODO: replace account & region with an extendable type which captures partition etc.
  const getNodesFn = sourceFile.writeLine('import { evaluateSelector } from "@infrascan/core";')
    .writeLine('import type { Connector, GraphNode } from "@infrascan/shared-types";')
    .newLine()
    .writeLine('export async function getNodes(stateConnector: Connector, account: string, region: string): Promise<GraphNode[]> {')
    .writeLine("\tlet state: GraphNode[] = [];");
  nodes.forEach((selector, idx) => {
    getNodesFn
      .writeLine(`\tconst nodes${idx+1} = await evaluateSelector(account, region, "${selector}", stateConnector);`)
      .writeLine(`\tstate = state.concat(nodes${idx+1});`)
  });
  return getNodesFn.writeLine('\treturn state;')
    .writeLine('}');
}

function declareGetter(scannerDefinition: BaseScannerDefinition, getter: BaseGetter, sourceFile: CodeBlockWriter): CodeBlockWriter {
  const commandTypes = getCommandTypesForServiceGetter(getter);

  const hasParameters = getter.parameters != null;
  const hasPaginationTokens = getter.paginationToken != null;

  return sourceFile.write(`export async function ${getFunctionNameForGetter(getter)}(client: ${getServiceClientClass(scannerDefinition)}, stateConnector: Connector, account: string, region: string): Promise<void> {`)
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
    .writeLine("\t} catch(err: unknown) {")
      // TODO: proper error handling
    .writeLine(`\t\tif(err instanceof ${getServiceErrorType(scannerDefinition)}) {`)
    .writeLine("\t\t\tif(err?.$retryable) {")
    .writeLine(`\t\t\t\tconsole.log("Encountered retryable error", err);`)
    .writeLine(`\t\t\t} else {`)
    .writeLine(`\t\t\t\tconsole.log("Encountered unretryable error", err);`)
    .writeLine("\t\t\t}")
    .writeLine("\t\t} else {")
    .writeLine('\t\t\tconsole.log("Encountered unexpected error", err);')
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

      const sourceWriter = writer.writeLine(`import { ${getServiceClientClass(scannerDefinition)}, ${getterCommands}, ${getServiceErrorType(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .conditionalWriteLine(hasParameterisedGetter, 'import { resolveFunctionCallParameters } from "@infrascan/core";')
        .writeLine(`import type { Connector, GenericState } from "@infrascan/shared-types";`)
        .writeLine(`import type { ${getterCommandTypes},  } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .newLine();
      scannerDefinition.getters.forEach((getter) => declareGetter(scannerDefinition, getter, sourceWriter));
    },
    { overwrite: config.overwrite },
  );

  await getters.save();

  const clientBuilder = project.createSourceFile(
    join(config.basePath, 'generated/client.ts'),
    (writer) => declareClientBuilder(scannerDefinition, writer),
    { overwrite: config.overwrite }
  );
  await clientBuilder.save();

  const nodesSelectors = project.createSourceFile(
    join(config.basePath, 'generated/nodes.ts'),
    (writer) => declareNodeSelector(scannerDefinition, writer),
    { overwrite: config.overwrite }
  );
  await nodesSelectors.save();

  suggestModuleExport(scannerDefinition);
}