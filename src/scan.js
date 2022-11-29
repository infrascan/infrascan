const AWS = require("aws-sdk");
const { SERVICES_CONFIG: SERVICES } = require("./services");
const jmespath = require("jmespath");
const fs = require("fs");
const { evaluateSelector, buildFilePathForServiceCall } = require("./utils");
const { scanIamRole, IAM_STORAGE } = require("./iam");

function resolveParameters(account, region, parameters) {
  return parameters.reduce((acc, { Key, Selector, Value }) => {
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
}

async function recordFunctionOutput(
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
  if (functionState.length === 1) {
    fs.writeFileSync(
      outputFilePath,
      JSON.stringify(functionState.pop(), undefined, 2)
    );
  } else {
    fs.writeFileSync(
      outputFilePath,
      JSON.stringify(functionState, undefined, 2)
    );
  }
}

async function makeFunctionCall(
  account,
  region,
  service,
  client,
  iamClient,
  functionCall
) {
  const { fn, parameters, formatter, iamRoleSelector } = functionCall;
  const params = parameters
    ? resolveParameters(account, region, parameters)
    : [{}];

  const state = [];
  for (let paramObj of params) {
    try {
      console.log(`${service} ${fn} ${paramObj}`);
      const result = (await client[fn](paramObj).promise()) ?? {};
      const formattedResult = formatter ? formatter(result) : result;

      if (iamRoleSelector) {
        const roleArn = jmespath.search(formattedResult, iamRoleSelector);
        await scanIamRole(iamClient, roleArn);
      }

      // using _ prefix to avoid issues with jmespath and dollar signs
      state.push({
        _parameters: paramObj,
        _result: formattedResult,
      });
    } catch (err) {
      if (err.retryable) {
        // TODO: impl retryable
        console.log("Encountered retryable error", err);
      } else {
        console.log("Non retryable error", err);
      }
    }
  }
  return state;
}

async function scanResourcesInAccount(account, region) {
  const iamClient = new AWS.IAM();
  for (let serviceScanner of SERVICES) {
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
      await recordFunctionOutput(
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

module.exports = {
  scanResourcesInAccount,
};
