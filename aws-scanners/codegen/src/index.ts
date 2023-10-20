import { join } from "path";
import { CodeBlockWriter, Project } from "ts-morph";

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
    .writeLine(`import type { AwsContext } from "@infrascan/shared-types";`)
    .newLine()
    .writeLine(`export function getClient(credentials: AwsCredentialIdentityProvider, context: AwsContext): ${getServiceClientClass(scannerDefinition)} {`)
    .tab()
    .write(`return new ${getServiceClientClass(scannerDefinition)}({ credentials, region: context.region });`)
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
  const hasIamRoles = scannerDefinition.iamRoles != null;
  let scannerGetterImports = scannerGetterNames.join(', ');
  if(hasIamRoles) {
    scannerGetterImports += ', getIamRoles';
  }

  const hasNodes = (scannerDefinition.nodes?.length ?? 0) > 0;
  const hasEdges = (scannerDefinition.edges?.length ?? 0) > 0;

  const graphImports = [];
  if(hasNodes) {
    graphImports.push('getNodes');
  }
  if(hasEdges) {
    graphImports.push('getEdges');
  }

  console.log("The expected export for this scanner is below. It should, at a minimum, serve as a strong starting point.")
  console.log("-----BEGIN EXPECTED EXPORT-----");
  console.log(`import { ${getServiceClientClass(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}"; 
${scannerDefinition.skipClientBuilder ? '' : 'import { getClient } from "./generated/client";'}
import { ${scannerGetterImports} } from "./generated/getters";
${graphImports.length ? `import { ${graphImports.join(',')} } from "./generated/graph";` : ""}
import type { ServiceModule } from "@infrascan/shared-types";

const ${scannerDefinition.clientKey}Scanner: ServiceModule<${getServiceClientClass(scannerDefinition)}, "aws"> = {
  provider: "${scannerDefinition.provider ?? "aws"}",
  service: "${scannerDefinition.service}",
  key: "${scannerDefinition.key}",
  getClient,
  callPerRegion: ${scannerDefinition.callPerRegion},
  getters: [${scannerGetterImports}],
  ${hasNodes ? `getNodes,` : ""}
  ${hasEdges ? `getEdges,` : ""}
  ${hasIamRoles ? "getIamRoles," : "" }
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

/**
 * Handles logic to scrape nodes and edges from state. Converts config selectors into explicit queries via the state connector to load and format the data.
 * @param scannerDefinition
 * @param sourceFile 
 * @returns Updated code block writer
 */
function declareGraphSelector(scannerDefinition: BaseScannerDefinition, sourceFile: CodeBlockWriter): CodeBlockWriter {
  const nodes = scannerDefinition.nodes ?? [];
  const hasNodes = nodes.length > 0;

  const edges = scannerDefinition.edges ?? [];
  const hasEdges = edges.length > 0;

  if(!hasEdges && !hasNodes) {
    return sourceFile;
  }

  const coreImports = [];
  if(hasNodes) {
    coreImports.push("evaluateSelector");
    coreImports.push("formatNode");
  } 
  if(hasEdges) {
    coreImports.push("evaluateSelectorGlobally");
    coreImports.push("filterState");
    coreImports.push("formatEdge");
  }

  const typeImports = [];
  if(hasNodes) {
    typeImports.push("SelectedNode");
    typeImports.push("GraphNode");
  }
  if(hasEdges) {
    typeImports.push("GraphEdge");
    typeImports.push("EdgeTarget");
  }

  let lastFnLabel: string | null;
  return sourceFile.writeLine(`import { ${coreImports.join(', ')} } from "@infrascan/core";`)
    .writeLine(`import type { Connector, AwsContext, ${typeImports.join(', ')} } from "@infrascan/shared-types";`)
    .newLine()
    .conditionalWriteLine(hasNodes, "export async function getNodes(stateConnector: Connector, context: AwsContext): Promise<GraphNode[]> {")
    .conditionalWriteLine(hasNodes, "\tconst state: SelectedNode[] = [];")
    .conditionalWrite(hasNodes, () => nodes.map((selector,idx) => {
      const fnLabel = selector.split('|')[1];
      let nodesVariable = `${fnLabel}Nodes`;
      if(fnLabel == lastFnLabel) {
        nodesVariable += idx;
      }
      const evaluateNodes = `\tconst ${nodesVariable} = await evaluateSelector(context.account, context.region, '${selector}', stateConnector);`;
      const extendState = `\tstate.push(...${nodesVariable});`;
      if(fnLabel != lastFnLabel) {
        lastFnLabel = fnLabel;
      }
      return evaluateNodes + "\n" + extendState;
    }).join('\n'))
    .conditionalWriteLine(hasNodes, `\treturn state.map((node) => formatNode(node, "${scannerDefinition.service}", "${scannerDefinition.key}"));`)
    .conditionalWriteLine(hasNodes, '}')
    .conditionalNewLine(hasNodes)
    .conditionalWriteLine(hasEdges, "export async function getEdges(stateConnector: Connector): Promise<GraphEdge[]> {")
    .conditionalWriteLine(hasEdges, "\tconst edges: GraphEdge[] = [];")
    .conditionalWrite(hasEdges, () => edges.map(({ state, from, to }, idx) => {
      const fnLabel = state.split('|')[1];
      const edgesState = `\tconst ${fnLabel}State${idx+1} = await evaluateSelectorGlobally("${state}", stateConnector);`;
      const evaluateEdges = `\tconst ${fnLabel}Edges${idx+1} = ${fnLabel}State${idx+1}.flatMap((state: any) => {
    const source = filterState(state, "${from}");
    const target: EdgeTarget | EdgeTarget[] | null = filterState(state, "${to}");
    if(!target || !source) {
      return [];
    }
    // Handle case of one to many edges
    if (Array.isArray(target)) {
      return target.map((edgeTarget) => formatEdge(source, edgeTarget));
    } else {
      return formatEdge(source, target);
    }
  });`
      const extendEdgeState = `\tedges.push(...${fnLabel}Edges${idx+1});`
      return edgesState + "\n" + evaluateEdges + "\n" + extendEdgeState;
    }).join('\n'))
    .conditionalWriteLine(hasEdges, "\treturn edges;")
    .conditionalWriteLine(hasEdges, "}");
}

/**
 * Returns references to IAM Role Arns and the ID of the Node that will take them. This roles are considered within the global context based on AWS' tenancy model.
 * @param scannerDefinition 
 * @param sourceFile 
 * @returns Updated code block writer
 */
function declareIamRoleGetter(scannerDefinition: BaseScannerDefinition, sourceFile: CodeBlockWriter): CodeBlockWriter {
  const iamRoles = scannerDefinition.iamRoles ?? [];
  if(iamRoles.length === 0) {
    return sourceFile;
  }

  const iamRoleGetterFunc = sourceFile.writeLine(`export async function getIamRoles(stateConnector: Connector): Promise<EntityRoleData[]> {`)
    .writeLine(`\tlet state: EntityRoleData[] = [];`);

  let lastStateSelector: string | null;
  iamRoles.forEach((selector, idx) => {
    const [_, func] = selector.split('|');
    let iamRoleState = `${func}RoleState`;
    if(lastStateSelector == iamRoleState) {
      iamRoleState += idx;
    }
    iamRoleGetterFunc
      .writeLine(`\tconst ${iamRoleState} = (await evaluateSelectorGlobally("${selector}", stateConnector)) as EntityRoleData[];`)
      .writeLine(`\tstate = state.concat(${iamRoleState});`);
    if(lastStateSelector != iamRoleState) {
      lastStateSelector = iamRoleState;
    }
  });
  
  return iamRoleGetterFunc
    .writeLine('\treturn state;')
    .writeLine('}')
    .newLine();
}

function declareGetter(scannerDefinition: BaseScannerDefinition, getter: BaseGetter, sourceFile: CodeBlockWriter): CodeBlockWriter {
  const commandTypes = getCommandTypesForServiceGetter(getter);

  const hasParameters = getter.parameters != null;
  const hasPaginationTokens = getter.paginationToken != null;

  return sourceFile.write(`export async function ${getFunctionNameForGetter(getter)}(client: ${getServiceClientClass(scannerDefinition)}, stateConnector: Connector, context: AwsContext): Promise<void> {`)
    .writeLine(`const state: GenericState[] = [];`)
    .writeLine("try {")
    // TODO: handle verbose logging correctly in generated code
    .writeLine(`\tconsole.log("${scannerDefinition.service} ${getFunctionNameForGetter(getter)}");`)
    .conditionalWriteLine(hasParameters, `\tconst resolvers = ${JSON.stringify(getter.parameters)};`)
    .conditionalWriteLine(hasParameters, `\tconst parameterQueue = await resolveFunctionCallParameters(context.account, context.region, resolvers, stateConnector) as ${commandTypes.input}[];`)
    .conditionalWriteLine(hasParameters, `\tfor(const parameters of parameterQueue) {`)
    .conditionalWriteLine(hasPaginationTokens, `\t\tlet pagingToken: string | undefined = undefined;`)
    .conditionalWriteLine(hasPaginationTokens, "\t\tdo {")
    .conditionalWriteLine(!hasParameters,`\t\t\tconst preparedParams: ${commandTypes.input} = {};`)
    .conditionalWriteLine(hasParameters, `\t\t\tconst preparedParams: ${commandTypes.input} = parameters;`)
    .conditionalWriteLine(hasPaginationTokens, `\t\t\tpreparedParams["${getter.paginationToken?.request}"] = pagingToken;`)
    .writeLine(`\t\t\tconst cmd = new ${commandTypes.command}(preparedParams);`)
    .writeLine(`\t\t\tconst result: ${commandTypes.output} = await client.send(cmd);`)
    .writeLine(`\t\t\tstate.push({ _metadata: { account: context.account, region: context.region }, _parameters: preparedParams, _result: result })`)
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
    .writeLine(`\tawait stateConnector.onServiceScanCompleteCallback(context.account, context.region, "${scannerDefinition.clientKey}", "${getFunctionNameForGetter(getter)}", state);`)
    .writeLine("}")
    .newLine();
}

export default async function generateScanner(scannerDefinition: BaseScannerDefinition, config: CodegenConfig) {
  const project = new Project();

  const getters = project.createSourceFile(
    join(config.basePath, "generated/getters.ts"),
    (writer) => {
      const hasParameterisedGetter = scannerDefinition.getters.some((getter) => getter.parameters != null);
      const hasRoles = (scannerDefinition.iamRoles ?? []).length > 0;
      
      // Get all of the `Command` types required for this scanner
      const getterImports = scannerDefinition.getters.map(getCommandTypesForServiceGetter);
      // Then split between `XXXCommand` (used as a Class) and `XXXCommandInput/Output` types (used as types)
      const getterCommands = getterImports.map((types) => types.command).join(', ');
      const getterCommandTypes = getterImports.map((types) => `${types.input}, ${types.output}`).join(', ');

      const coreImports = [];
      const typeImports = ["Connector", "GenericState", "AwsContext"];
      if(hasRoles) {
        typeImports.push("EntityRoleData");
        coreImports.push('evaluateSelectorGlobally');
      }
      if(hasParameterisedGetter) {
        coreImports.push('resolveFunctionCallParameters');
      }


      const sourceWriter = writer.writeLine(`import { ${getServiceClientClass(scannerDefinition)}, ${getterCommands}, ${getServiceErrorType(scannerDefinition)} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .conditionalWriteLine(coreImports.length > 0, `import { ${coreImports.join(', ')} } from "@infrascan/core";`)
        .writeLine(`import type { ${typeImports.join(', ')} } from "@infrascan/shared-types";`)
        .writeLine(`import type { ${getterCommandTypes} } from "@aws-sdk/client-${scannerDefinition.service}";`)
        .newLine();
      scannerDefinition.getters.forEach((getter) => declareGetter(scannerDefinition, getter, sourceWriter));
      if(hasRoles){
        declareIamRoleGetter(scannerDefinition, sourceWriter);
      }
    },
    { overwrite: config.overwrite },
  );

  await getters.save();

  if(!scannerDefinition.skipClientBuilder) {
    const clientBuilder = project.createSourceFile(
      join(config.basePath, 'generated/client.ts'),
      (writer) => declareClientBuilder(scannerDefinition, writer),
      { overwrite: config.overwrite }
    );
    await clientBuilder.save();
  }

  const nodesSelectors = project.createSourceFile(
    join(config.basePath, 'generated/graph.ts'),
    (writer) => declareGraphSelector(scannerDefinition, writer),
    { overwrite: config.overwrite }
  );
  await nodesSelectors.save();

  suggestModuleExport(scannerDefinition);
}