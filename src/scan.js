const AWS = require('aws-sdk');
const { SERVICES_CONFIG: SERVICES } = require('./services');
const jmespath = require('jmespath');
const fs = require('fs');
const { buildFilePathForServiceCall } = require('./utils');
const { scanIamRole, IAM_STORAGE } = require('./iam');

function resolveParameters(account, region, parameters) {
  return parameters.reduce((acc, { Key, Selector }) => {
    const [
      service, 
      functionCall, 
      selector
    ] = Selector.split('|');

    const filePath = buildFilePathForServiceCall(account, region, service, functionCall);
    const state = fs.readFileSync(filePath, 'utf8');
    const parameterValues = jmespath.search(JSON.parse(state), selector);
    console.log(state, selector);
    for(let idx = 0; idx < parameterValues.length; idx++) {
      if(acc[idx] == null) {
        acc[idx] = {};
      }
      acc[idx][Key] = parameterValues[idx];
    }
    return acc;
  }, []);
}

async function scanResourcesInAccount(account, region) {
  const iamClient = new AWS.IAM();
  for(let functionCall of SERVICES) {
    const {
      service,
      fn,
      parameters,
      formatter,
      iamRoleSelector
    } = functionCall;

    const client = new AWS[service]({
      region
    });

    const params = parameters ? resolveParameters(account, region, parameters) : [{}];

    const state = [];
    for(let paramObj of params) {
      try {
        console.log(`${service} ${fn} ${paramObj}`);
        const result = await client[fn](paramObj).promise();
        console.log(`${service}:${region}:${fn}`, result);
        const formattedResult = formatter ? formatter(result) : result;
        console.log(`${service}:${region}:${fn}`, formattedResult);

        if(iamRoleSelector) {
          const roleArn = jmespath.search(formattedResult, iamRoleSelector);
          await scanIamRole(iamClient, roleArn);
        }

        state.push(formattedResult);
      } catch (err) {
        if(err.retryable) {
          // TODO: impl retryable
          console.log('Encountered retryable error', err);
        } else {
          console.log('Non retryable error', err);
        }
      }
    }

    const outputFilePath = buildFilePathForServiceCall(account, region, service, fn);
    if(state.length === 1) {
      fs.writeFileSync(outputFilePath, JSON.stringify(state.pop(), undefined, 2));
    } else {
      fs.writeFileSync(outputFilePath, JSON.stringify(state, undefined, 2));
    }
  }
  const iamFilePath = buildFilePathForServiceCall(account, region, 'IAM', 'roles');
  fs.writeFileSync(iamFilePath, JSON.stringify(IAM_STORAGE.getAllRoles(), undefined, 2));
}

module.exports = {
  scanResourcesInAccount
}