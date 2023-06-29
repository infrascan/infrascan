import {
  Project,
  CodeBlockWriter,
  SourceFile,
  FunctionDeclaration,
  FormatCodeSettings,
  VariableDeclarationKind,
} from "ts-morph";
import { SemicolonPreference } from "typescript";

import type {
  PaginationToken,
  ServiceGetter,
  ScannerDefinition,
  EdgeResolver,
} from "./types";

type ServiceFunctionImports = {
  input: string;
  output: string;
  command: string;
};

function generateFunctionImports(
  serviceFunction: string
): ServiceFunctionImports {
  return {
    input: `${serviceFunction}CommandInput`,
    output: `${serviceFunction}CommandOutput`,
    command: `${serviceFunction}Command`,
  };
}

function performParameterisedFunctionCall(
  writer: CodeBlockWriter,
  serviceFunction: ServiceFunctionImports,
  parameterVariableName: string,
  pagingTokenVariableName: string,
  resultVariableName: string,
  clientVariableName: string,
  paginationToken?: PaginationToken
): void {
  if (paginationToken?.request != null) {
    writer.writeLine(
      `requestParameters["${paginationToken.request}"] = ${pagingTokenVariableName};`
    );
  }
  writer.writeLine(
    `const ${parameterVariableName} = new ${serviceFunction.command}(requestParameters);`
  );
  writer.writeLine(
    `const ${resultVariableName}: ${serviceFunction.output} = await ${clientVariableName}.send(${parameterVariableName});`
  );
}

function performNonParameterisedFunctionCall(
  writer: CodeBlockWriter,
  serviceFunction: ServiceFunctionImports,
  parameterVariableName: string,
  pagingTokenVariableName: string,
  resultVariableName: string,
  clientVariableName: string,
  paginationToken?: PaginationToken
): void {
  if (paginationToken?.request != null) {
    writer.writeLine(
      `const ${parameterVariableName} = new ${serviceFunction.command}({ "${paginationToken.request}": ${pagingTokenVariableName} } as ${serviceFunction.input});`
    );
  } else {
    writer.writeLine(
      `const ${parameterVariableName} = new ${serviceFunction.command}({} as ${serviceFunction.input});`
    );
  }
  writer.writeLine(
    `const ${resultVariableName}: ${serviceFunction.output} = await ${clientVariableName}.send(${parameterVariableName});`
  );
}

function scanIAMRolesFromState(
  writer: CodeBlockWriter,
  iamRoleSelectors: string[]
) {
  const serializedIAMSelectors = iamRoleSelectors
    .map((selector) => `"${selector}"`)
    .join(",");
  writer.writeLine(`const iamRoleSelectors = [${serializedIAMSelectors}]`);
  writer.writeLine("for(const selector of iamRoleSelectors)").block(() => {
    writer.writeLine(
      "const selectionResult = jmespath.search(result, selector);"
    );
    writer.writeLine(`if(Array.isArray(selectionResult))`).block(() => {
      writer.writeLine(`for(const roleArn of selectionResult)`).block(() => {
        writer.writeLine("await scanIamRole(iamStorage, iamClient, roleArn);");
      });
    });
    writer.writeLine("else if(selectionResult != null)").block(() => {
      writer.writeLine(
        "await scanIamRole(iamStorage, iamClient, selectionResult);"
      );
    });
  });
}

function implementFunctionCallForScanner(
  writer: CodeBlockWriter,
  clientVariableName: string,
  service: string,
  getter: ServiceGetter
): CodeBlockWriter {
  const { fn, paginationToken, parameters, formatter, iamRoleSelectors } =
    getter;
  const serviceFunction = generateFunctionImports(fn);

  // Setup state
  writer.writeLine(`const ${fn}State: GenericState[] = [];`);

  // impls service scan, added as a function to allow for looping vs one off calls
  function scanResource(hasParameters: boolean): void {
    writer.writeLine("try").block(() => {
      writer.writeLine(`console.log("${service} ${fn}");`);
      const pagingTokenVariable = `${fn}PagingToken`;
      writer.writeLine(
        `let ${pagingTokenVariable}: string | undefined = undefined;`
      );
      writer.writeLine("do {");

      let resultVariable = "result";

      const parameterVariableName = `${fn}Cmd`;
      if (hasParameters) {
        performParameterisedFunctionCall(
          writer,
          serviceFunction,
          parameterVariableName,
          pagingTokenVariable,
          resultVariable,
          clientVariableName,
          paginationToken
        );
      } else {
        performNonParameterisedFunctionCall(
          writer,
          serviceFunction,
          parameterVariableName,
          pagingTokenVariable,
          resultVariable,
          clientVariableName,
          paginationToken
        );
      }
      if (formatter != null) {
        writer.writeLine(
          `const formattedResult = ${formatter}(${resultVariable});`
        );
        resultVariable = "formattedResult";
      }

      writer.writeLine(
        `${fn}State.push({ _metadata: { account, region }, _parameters: ${
          hasParameters ? "requestParameters" : "{}"
        }, _result: ${resultVariable} });`
      );

      if (paginationToken?.response != null) {
        writer.writeLine(
          `${pagingTokenVariable} = result["${paginationToken.response}"]`
        );
      }

      if (iamRoleSelectors != null) {
        scanIAMRolesFromState(writer, iamRoleSelectors);
      }
      writer.writeLine(`} while(${pagingTokenVariable} != null);`);
    });
    writer.writeLine("catch(err: any)").block(() => {
      writer.writeLine("if(err?.retryable)").block(() => {
        writer.writeLine('console.log("Encountered retryable error", err);');
      });
    });
  }

  const hasParameters = parameters != null;
  if (hasParameters) {
    // TODO: add types here
    writer.writeLine(
      `const ${fn}ParameterResolvers = ${JSON.stringify(parameters)};`
    );
    const parametersVariable = `${fn}Parameters`;
    writer.writeLine(
      `const ${parametersVariable} = (await resolveFunctionCallParameters(account, region, ${fn}ParameterResolvers, resolveStateForServiceCall)) as ${fn}CommandInput[];`
    );
    writer
      .writeLine(`for(const requestParameters of ${parametersVariable})`)
      .block(() => scanResource(hasParameters));
  } else {
    scanResource(hasParameters);
  }

  writer.writeLine(
    `await onServiceCallComplete(account, region, "${service}", "${fn}", ${fn}State);`
  );
  return writer;
}

function addStandardScannerImports(sourceFile: SourceFile): void {
  // Import shared types for scanners
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: [
      "ServiceScanCompleteCallbackFn",
      "ResolveStateFromServiceFn",
    ],
    moduleSpecifier: "@shared-types/api",
  });
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: ["GenericState"],
    moduleSpecifier: "@shared-types/scan",
  });
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: ["AwsCredentialIdentityProvider"],
    moduleSpecifier: "@aws-sdk/types",
  });
}

function addScannerSpecificImports(
  sourceFile: SourceFile,
  config: ScannerDefinition
): void {
  const commandImports = config.getters.flatMap(({ fn }) =>
    Object.values(generateFunctionImports(fn))
  );
  // Import service from AWS
  sourceFile.addImportDeclaration({
    namedImports: [`${config.clientKey}Client`, ...commandImports],
    moduleSpecifier: `@aws-sdk/client-${config.service}`,
  });

  // If service contains references to IAM roles, import the IAM client and jmespath selector
  sourceFile.addImportDeclaration({
    namedImports: ["scanIamRole", "IAMStorage"],
    moduleSpecifier: "../helpers/iam",
  });
  sourceFile.addImportDeclaration({
    namedImports: ["IAM"],
    moduleSpecifier: "@aws-sdk/client-iam",
  });
  const hasIAMRoles = config.getters.some(
    ({ iamRoleSelectors }) => iamRoleSelectors != null
  );
  if (hasIAMRoles) {
    sourceFile.addImportDeclaration({
      defaultImport: "jmespath",
      moduleSpecifier: "jmespath",
    });
  }

  const hasParams = config.getters.some(({ parameters }) => parameters != null);
  if (hasParams) {
    sourceFile.addImportDeclaration({
      namedImports: ["resolveFunctionCallParameters"],
      moduleSpecifier: "../helpers/state",
    });
  }

  // If service contains formatters, import the formatters module
  const hasOutputFormatters = config.getters.some(
    ({ formatter }) => formatter != null
  );
  if (hasOutputFormatters) {
    sourceFile.addImportDeclaration({
      namespaceImport: "formatters",
      moduleSpecifier: "../helpers/formatters",
    });
  }
}

function createScanEntrypoint(sourceFile: SourceFile): FunctionDeclaration {
  // Create top level scan function
  return sourceFile.addFunction({
    name: "performScan",
    isAsync: true,
    parameters: [
      {
        name: "credentials",
        type: "AwsCredentialIdentityProvider",
      },
      {
        name: "account",
        type: "string",
      },
      {
        name: "region",
        type: "string",
      },
      {
        name: "iamClient",
        type: "IAM",
      },
      {
        name: "iamStorage",
        type: "IAMStorage",
      },
      {
        name: "onServiceCallComplete",
        type: "ServiceScanCompleteCallbackFn",
      },
      {
        name: "resolveStateForServiceCall",
        type: "ResolveStateFromServiceFn",
      },
    ],
  });
}

function addGeneratedFileNotice(sourceFile: SourceFile): void {
  sourceFile.insertText(
    0,
    "// This file is autogenerated using infrascan-codegen. Do not manually edit this file.\n"
  );
}

function addNodeSelectorVariable(
  sourceFile: SourceFile,
  nodeSelectors: string[]
): string {
  const nodeSelectorVariable = "NODE_SELECTORS";
  const formattedSelectors = nodeSelectors.map((node) => `"${node}"`).join(",");
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: nodeSelectorVariable,
        initializer: `[${formattedSelectors}]`,
      },
    ],
  });
  return nodeSelectorVariable;
}

function addEdgeSelectorVariable(
  sourceFile: SourceFile,
  edgeSelectors: EdgeResolver[]
): string {
  const edgeSelectorVariable = "EDGE_SELECTORS";
  const formattedSelectors = edgeSelectors
    .map((edge) => JSON.stringify(edge))
    .join(",");
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: edgeSelectorVariable,
        initializer: `[${formattedSelectors}]`,
      },
    ],
  });
  return edgeSelectorVariable;
}

const FORMATTER_CONFIG: Readonly<FormatCodeSettings> = {
  placeOpenBraceOnNewLineForControlBlocks: false,
  placeOpenBraceOnNewLineForFunctions: false,
  semicolons: SemicolonPreference.Insert,
  indentSize: 2,
};

export function generateService(
  project: Project,
  basePath: string,
  config: ScannerDefinition,
  verbose: boolean
) {
  const sourceFile = project.createSourceFile(
    `./${basePath}/${config.key}.generated.ts`
  );
  addGeneratedFileNotice(sourceFile);
  addStandardScannerImports(sourceFile);
  addScannerSpecificImports(sourceFile, config);

  const scanEntrypointFunction = createScanEntrypoint(sourceFile);
  scanEntrypointFunction.setBodyText((writer) => {
    const clientVariableName = config.clientKey;
    writer.writeLine(
      `const ${clientVariableName} = new ${config.clientKey}Client({ region, credentials });`
    );
    for (const getter of config.getters) {
      implementFunctionCallForScanner(
        writer,
        clientVariableName,
        config.service,
        getter
      );
      writer.blankLine();
    }
  });

  const exportedVars = [scanEntrypointFunction.getName() as string];

  if (config.nodes != null) {
    const nodeSelectorVariable = addNodeSelectorVariable(
      sourceFile,
      config.nodes
    );
    exportedVars.push(nodeSelectorVariable);
  }

  if (config.edges != null) {
    const edgeSelectorVariable = addEdgeSelectorVariable(
      sourceFile,
      config.edges
    );
    exportedVars.push(edgeSelectorVariable);
  }

  sourceFile.addExportDeclaration({
    namedExports: exportedVars,
  });
  if (verbose) {
    console.log(sourceFile.getFilePath());
    console.log(sourceFile.getText());
  }
  sourceFile.formatText(FORMATTER_CONFIG);
  sourceFile.saveSync();
}
