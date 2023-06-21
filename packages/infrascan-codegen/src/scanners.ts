import { Project, CodeBlockWriter } from "ts-morph";
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

const SERVICE_FUNCTION_IMPORT_SUFFIXES: readonly string[] = [
  "Command",
  "CommandInput",
  "CommandOutput",
];

function generateFunctionImports(serviceFunction: string): string[] {
  return SERVICE_FUNCTION_IMPORT_SUFFIXES.map(
    (suffix) => serviceFunction + suffix
  );
}

function implementFunctionCallForScanner(
  writer: CodeBlockWriter,
  clientVariableName: string,
  service: string,
  getter: ServiceGetter
): CodeBlockWriter {
  const { fn, paginationToken, parameters, formatter, iamRoleSelectors } =
    getter;

  // Setup state
  writer.blankLine();
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
      if (hasParameters) {
        if (paginationToken?.request != null) {
          writer.writeLine(
            `requestParameters["${paginationToken.request}"] = ${pagingTokenVariable};`
          );
        }
        writer.writeLine(
          `const ${fn}Cmd = new ${fn}Command(requestParameters);`
        );
        writer.writeLine(
          `const ${resultVariable}: ${fn}CommandOutput = await ${clientVariableName}.send(${fn}Cmd);`
        );
      } else {
        if (paginationToken?.request != null) {
          writer.writeLine(
            `const ${fn}Cmd = new ${fn}Command({ "${paginationToken.request}": ${pagingTokenVariable} } as ${fn}CommandInput);`
          );
        } else {
          writer.writeLine(
            `const ${fn}Cmd = new ${fn}Command({} as ${fn}CommandInput);`
          );
        }
        writer.writeLine(
          `const ${resultVariable}: ${fn}CommandOutput = await ${clientVariableName}.send(${fn}Cmd);`
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
        const serializedIAMSelectors = iamRoleSelectors
          .map((selector) => `"${selector}"`)
          .join(",");
        writer.writeLine(
          `const iamRoleSelectors = [${serializedIAMSelectors}]`
        );
        writer
          .writeLine("for(const selector of iamRoleSelectors)")
          .block(() => {
            writer.writeLine(
              "const selectionResult = jmespath.search(result, selector);"
            );
            writer.writeLine(`if(Array.isArray(selectionResult)`).block(() => {
              writer
                .writeLine(`for(const roleArn of selectionResult)`)
                .block(() => {
                  writer.writeLine("console.log(roleArn);");
                });
            });
            writer.writeLine("else if(selectionResult != null)").block(() => {
              writer.writeLine("console.log(selectionResult);");
            });
          });
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
    `await onServiceScanComplete(account, region, "${service}", "${fn}", ${fn}State);`
  );
  return writer;
}

export function generateScanner(project: Project, config: ScannerDefinition) {
  const sourceFile = project.createSourceFile(
    `./aws/services/${config.clientKey}.ts`
  );

  // Import shared types for scanners
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: [
      "ServiceScanCompleteCallbackFn",
      "ResolveStateFromServiceFn",
    ],
    moduleSpecifier: "@sharedTypes/api",
  });
  sourceFile.addImportDeclaration({
    isTypeOnly: true,
    namedImports: ["GenericState"],
    moduleSpecifier: "@sharedTypes/scan",
  });

  const commandImports = config.getters.flatMap(({ fn }) =>
    generateFunctionImports(fn)
  );
  // Import service from AWS
  sourceFile.addImportDeclaration({
    namedImports: [`${config.clientKey}Client`, ...commandImports],
    moduleSpecifier: `@aws-sdk/client-${config.service}`,
  });

  // If service contains references to IAM roles, import the IAM client
  const hasIamRoleSelectors = config.getters.some(
    ({ iamRoleSelectors }) => iamRoleSelectors != null
  );
  if (hasIamRoleSelectors) {
    sourceFile.addImportDeclaration({
      namedImports: ["IAM"],
      moduleSpecifier: "@aws-sdk/client-iam",
    });
    sourceFile.addImportDeclaration({
      defaultImport: "jmespath",
      moduleSpecifier: "jmespath",
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

  // Create top level scan function
  const scanFunction = sourceFile.addFunction({
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
        name: "onServiceScanComplete",
        type: "ServiceScanCompleteCallbackFn",
      },
      {
        name: "resolveStateForServiceCall",
        type: "ResolveStateFromServiceFn",
      },
    ],
  });

  scanFunction.setBodyText((writer) => {
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
    }
  });
  sourceFile.addExportDeclaration({
    namedExports: ["performScan"],
  });
  sourceFile.formatText({
    placeOpenBraceOnNewLineForControlBlocks: false,
    placeOpenBraceOnNewLineForFunctions: false,
    semicolons: SemicolonPreference.Insert,
    indentSize: 2,
  });
  console.log(sourceFile.getFilePath());
  console.log(sourceFile.getText());
  sourceFile.saveSync();
}
