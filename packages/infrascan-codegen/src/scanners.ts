import {
  Project,
  CodeBlockWriter,
  SourceFile,
  FunctionDeclaration,
  FormatCodeSettings,
} from "ts-morph";
import { SemicolonPreference } from "typescript";

export type ParameterResolver = {
  Key: string;
  Selector?: string;
  Value?: any;
};

export type EdgeResolver = {
  state: string;
  from: string;
  to: string;
};

export type PaginationToken = {
  request?: string;
  response?: string;
};

export type ServiceGetter = {
  fn: string;
  parameters?: ParameterResolver[];
  formatter?: string;
  paginationToken?: PaginationToken;
  iamRoleSelectors?: string[];
};

export type ScannerDefinition = {
  service: string;
  clientKey: string;
  key: string;
  getters: ServiceGetter[];
  arnLabel?: string;
  nodes?: string[];
  edges?: EdgeResolver[];
  iamRoles?: string[];
};

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
        writer.writeLine(
          "await scanIamRole(iamRoleStorage, iamClient, roleArn);"
        );
      });
    });
    writer.writeLine("else if(selectionResult != null)").block(() => {
      writer.writeLine(
        "await scanIamRole(iamRoleStorage, iamClient, roleArn);"
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
    moduleSpecifier: "./types/api",
  });
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: ["GenericState"],
    moduleSpecifier: "./types/scan",
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
  const hasIamRoleSelectors = config.getters.some(
    ({ iamRoleSelectors }) => iamRoleSelectors != null
  );
  if (hasIamRoleSelectors) {
    sourceFile.addImportDeclaration({
      namedImports: ["scanIamRole", "IAMStorage"],
      moduleSpecifier: "./helpers/iam",
    });
    sourceFile.addImportDeclaration({
      defaultImport: "jmespath",
      moduleSpecifier: "jmespath",
    });
    sourceFile.addImportDeclaration({
      namedImports: ["IAM"],
      moduleSpecifier: "@aws-sdk/client-iam",
    });
  }

  // If service contains formatters, import the formatters module
  const hasOutputFormatters = config.getters.some(
    ({ formatter }) => formatter != null
  );
  if (hasOutputFormatters) {
    sourceFile.addImportDeclaration({
      namespaceImport: "formatters",
      moduleSpecifier: "./formatters",
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

const FORMATTER_CONFIG: Readonly<FormatCodeSettings> = {
  placeOpenBraceOnNewLineForControlBlocks: false,
  placeOpenBraceOnNewLineForFunctions: false,
  semicolons: SemicolonPreference.Insert,
  indentSize: 2,
};
export function generateScanner(project: Project, config: ScannerDefinition) {
  const sourceFile = project.createSourceFile(
    `./aws/services/${config.clientKey}.ts`
  );
  addGeneratedFileNotice(sourceFile);
  addStandardScannerImports(sourceFile);
  addScannerSpecificImports(sourceFile, config);

  const scanEntrypointFunction = createScanEntrypoint(sourceFile);
  scanEntrypointFunction.setBodyText((writer) => {
    const clientVariableName = config.clientKey;
    writer.writeLine(
      `const ${clientVariableName} = new ${config.clientKey}Client({ region });`
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
  sourceFile.addExportDeclaration({
    namedExports: [scanEntrypointFunction.getName() as string],
  });
  sourceFile.formatText(FORMATTER_CONFIG);
  console.log(sourceFile.getFilePath());
  console.log(sourceFile.getText());
  sourceFile.saveSync();
}
