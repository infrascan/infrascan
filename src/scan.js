const AWS = require("aws-sdk");
const { SERVICES_CONFIG: SERVICES } = require("./services");
const jmespath = require("jmespath");
const fs = require("fs");
const {
  whoami,
  evaluateSelector,
  buildFilePathForServiceCall,
  METADATA_PATH,
  DEFAULT_REGION,
  splitServicesByGlobalAndRegional,
} = require("./utils");
const { scanIamRole, IAM_STORAGE } = require("./iam");
const ERROR_CODES_TO_IGNORE = ["NoSuchWebsiteConfiguration", "NoSuchTagSet"];

function resolveParameters(account, region, parameters) {
  const allParamObjects = parameters.reduce((acc, { Key, Selector, Value }) => {
    if (Selector) {
      const parameterValues = evaluateSelector(account, region, Selector);
      for (let idx = 0; idx < parameterValues.length; idx++) {
        if (acc[idx] == null) {
          acc[idx] = {};
        }
        acc[idx][Key] = parameterValues[idx];
      }
    } else if (Value) {
      if (acc.length === 0) {
        acc.push({ [Key]: Value });
      } else {
        for (let parameterObject of acc) {
          parameterObject[Key] = Value;
        }
      }
    }
    return acc;
  }, []);
  const validatedParamObjects = allParamObjects.filter((obj) => {
    const allParamsPresent = parameters.every(({ Key }) =>
      Object.keys(obj).includes(Key)
    );
    return allParamsPresent;
  });
  return validatedParamObjects;
}

function recordFunctionOutput(
  account,
  region,
  service,
  functionName,
  functionState
) {
  const outputFilePath = buildFilePathForServiceCall(
    account,
    region,
    service,
    functionName
  );
  fs.writeFileSync(outputFilePath, JSON.stringify(functionState, undefined, 2));
}

async function makeFunctionCall(
  account,
  region,
  service,
  client,
  iamClient,
  functionCall
) {
  const { fn, parameters, formatter, iamRoleSelectors } = functionCall;
  const params = parameters
    ? resolveParameters(account, region, parameters)
    : [{}];

  const state = [];
  for (let paramObj of params) {
    try {
      console.log(`${service} ${fn}`);
      const result = (await client[fn](paramObj).promise()) ?? {};
      const formattedResult = formatter ? formatter(result) : result;

      if (iamRoleSelectors) {
        for (let selector of iamRoleSelectors) {
          const selectionResult = jmespath.search(formattedResult, selector);
          if (Array.isArray(selectionResult)) {
            for (let roleArn of selectionResult) {
              await scanIamRole(iamClient, roleArn);
            }
          } else if (selectionResult) {
            await scanIamRole(iamClient, selectionResult);
          }
        }
      }

      // using `_` prefix to avoid issues with jmespath and dollar signs
      state.push({
        // track context in metadata to allow mapping to parents
        _metadata: { account, region },
        _parameters: paramObj,
        _result: formattedResult,
      });
    } catch (err) {
      if (err.retryable) {
        // TODO: impl retryable
        console.log("Encountered retryable error", err);
      } else if (!ERROR_CODES_TO_IGNORE.includes(err.code)) {
        console.log("Non retryable error", err);
      }
    }
  }
  return state;
}

async function scanResourcesInAccount(account, region, servicesToScan) {
  const iamClient = new AWS.IAM();
  for (let serviceScanner of servicesToScan) {
    const { service, getters } = serviceScanner;

    const client = new AWS[service]({
      region,
    });

    for (let functionCall of getters) {
      const functionState = await makeFunctionCall(
        account,
        region,
        service,
        client,
        iamClient,
        functionCall
      );
      recordFunctionOutput(
        account,
        region,
        service,
        functionCall.fn,
        functionState
      );
    }
  }
  const iamFilePath = buildFilePathForServiceCall(
    account,
    region,
    "IAM",
    "roles"
  );
  fs.writeFileSync(
    iamFilePath,
    JSON.stringify(IAM_STORAGE.getAllRoles(), undefined, 2)
  );
}

async function performScan(config) {
  const { global, regional } = splitServicesByGlobalAndRegional(SERVICES);

  const scanMetadata = [];
  for (let accountConfig of config) {
    const { profile, regions, services } = accountConfig;
    const credentials = new AWS.SharedIniFileCredentials({
      profile,
    });
    AWS.config.update({ credentials, region: DEFAULT_REGION });
    const globalCaller = await whoami();
    const accountMetadataEntry = scanMetadata.find(
      ({ account }) => account === globalCaller.Account
    );
    if (!accountMetadataEntry) {
      scanMetadata.push({
        account: globalCaller.Account,
        regions: [],
      });
    }
    console.log(`Scanning global resources in ${globalCaller.Account}`);
    if (services?.length > 0) {
      const filteredGlobalServices = global.filter(({ service }) =>
        services.includes(service)
      );
      await scanResourcesInAccount(
        globalCaller.Account,
        "us-east-1",
        filteredGlobalServices
      );
    } else {
      await scanResourcesInAccount(globalCaller.Account, "us-east-1", global);
    }

    for (let region of regions) {
      AWS.config.update({
        region,
      });
      const caller = await whoami();
      console.log(`Beginning scan of ${caller.Account} in ${region}`);
      const servicesToScan = services ?? [];
      if (servicesToScan.length > 0) {
        console.log(`Filtering services according to supplied list`, {
          servicesToScan,
        });
        const filteredRegionalServices = regional.filter(({ service }) =>
          servicesToScan.includes(service)
        );
        await scanResourcesInAccount(
          caller.Account,
          region,
          filteredRegionalServices
        );
      } else {
        await scanResourcesInAccount(caller.Account, region, regional);
      }
      console.log(`Scan of ${caller.Account} in ${region} complete`);
      const metadataEntry = scanMetadata.find(
        ({ account }) => account === caller.Account
      );
      metadataEntry.regions.push(region);
    }
  }

  fs.writeFileSync(METADATA_PATH, JSON.stringify(scanMetadata, undefined, 2));
}

module.exports = {
  performScan,
};
