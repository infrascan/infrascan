import { Project, SourceFile, VariableDeclarationKind } from "ts-morph";
import type { ScannerDefinition } from "@infrascan/shared-types";

function kebabCaseToCamelCase(val: string): string {
  const tokens = val.split("-");
  const capitalisedTokens = tokens
    .slice(1)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1));
  return [tokens[0], ...capitalisedTokens].join("");
}

function addServiceScannerImport(sourceFile: SourceFile, service: string) {
  sourceFile.addImportDeclaration({
    namespaceImport: kebabCaseToCamelCase(service),
    moduleSpecifier: `./${service}.generated`,
  });
}

function createExportObjectForKey(services: ScannerDefinition[], key: string) {
  const preparedServices = services.reduce(
    (scannersByService, currentService) => {
      if (scannersByService[currentService.service]) {
        scannersByService[currentService.service].push(currentService.key);
      } else {
        scannersByService[currentService.service] = [currentService.key];
      }
      return scannersByService;
    },
    {} as Record<string, string[]>
  );
  const keyValuePairs = Object.entries(preparedServices)
    .map(([serviceName, scanners]) => {
      const scannersFnList = scanners
        .map((clientKey) => `${kebabCaseToCamelCase(clientKey)}.${key}`)
        .join(", ");
      return `"${serviceName}": [${scannersFnList}]`;
    })
    .join(",\n");

  return `{\n${keyValuePairs}\n}`;
}

function createConst(
  sourceFile: SourceFile,
  variableName: string,
  value: string
) {
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: variableName,
        initializer: value,
      },
    ],
  });
}

function createScannerExportObject(services: ScannerDefinition[]) {
  return createExportObjectForKey(services, "performScan");
}

function createNodeSelectorExport(
  sourceFile: SourceFile,
  services: ScannerDefinition[],
  variableName: string
) {
  const exportObject = createExportObjectForKey(services, "NODE_SELECTORS");
  createConst(sourceFile, variableName, exportObject);
}

function createEdgeSelectorExport(
  sourceFile: SourceFile,
  services: ScannerDefinition[],
  variableName: string
) {
  const exportObject = createExportObjectForKey(services, "NODE_SELECTORS");
  createConst(sourceFile, variableName, exportObject);
}

function declareScannerListAsConstant(
  sourceFile: SourceFile,
  services: ScannerDefinition[]
) {
  const globalServices = services.filter((service) => service.isGlobal);
  const globalScannersExport = createScannerExportObject(globalServices);
  const globalScannersVariable = "GLOBAL_SERVICE_SCANNERS";
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: globalScannersVariable,
        initializer: globalScannersExport,
      },
    ],
  });

  const globalServicesWithNodeSelectors = globalServices.filter(
    (service) => service.nodes != null
  );
  const globalNodeSelectorsVariable = "GLOBAL_NODE_SELECTORS";
  createNodeSelectorExport(
    sourceFile,
    globalServicesWithNodeSelectors,
    globalNodeSelectorsVariable
  );

  const globalServicesWithEdgeSelectors = globalServices.filter(
    (service) => service.edges != null
  );
  const globalEdgeSelectorsVariable = "GLOBAL_EDGE_SELECTORS";
  createEdgeSelectorExport(
    sourceFile,
    globalServicesWithEdgeSelectors,
    globalEdgeSelectorsVariable
  );

  const regionalServices = services.filter((service) => !service.isGlobal);
  const regionalScannersExport = createScannerExportObject(regionalServices);
  const regionalScannersVariable = "REGIONAL_SERVICE_SCANNERS";
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: regionalScannersVariable,
        initializer: regionalScannersExport,
      },
    ],
  });

  const regionalServicesWithNodeSelectors = regionalServices.filter(
    (service) => service.nodes != null
  );
  const regionalNodeSelectorsVariable = "REGIONAL_NODE_SELECTORS";
  createNodeSelectorExport(
    sourceFile,
    regionalServicesWithNodeSelectors,
    regionalNodeSelectorsVariable
  );

  const regionalServicesWithEdgeSelectors = regionalServices.filter(
    (service) => service.edges != null
  );
  const regionalEdgeSelectorsVariable = "REGIONAL_EDGE_SELECTORS";
  createNodeSelectorExport(
    sourceFile,
    regionalServicesWithEdgeSelectors,
    regionalEdgeSelectorsVariable
  );

  sourceFile.addExportDeclaration({
    namedExports: [
      regionalScannersVariable,
      regionalNodeSelectorsVariable,
      regionalEdgeSelectorsVariable,
      globalScannersVariable,
      globalNodeSelectorsVariable,
      globalEdgeSelectorsVariable,
    ],
  });
}

export function generateEntrypoint(
  project: Project,
  basePath: string,
  services: ScannerDefinition[],
  overwrite: boolean,
  verbose: boolean
) {
  const sourceFile = project.createSourceFile(
    `./${basePath}/index.generated.ts`,
    "",
    { overwrite }
  );

  sourceFile.insertText(
    0,
    "// This file is autogenerated using infrascan-codegen. Do not manually edit this file.\n"
  );
  for (let service of services) {
    addServiceScannerImport(sourceFile, service.key);
  }
  // Create list of service modules imported
  declareScannerListAsConstant(sourceFile, services);

  sourceFile.formatText();
  if (verbose) {
    console.log(sourceFile.getFilePath());
    console.log(sourceFile.getText());
  }
  sourceFile.saveSync();
}
