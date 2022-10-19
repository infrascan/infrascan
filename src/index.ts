import * as AWS from 'aws-sdk';
import { servicesConfig, DEFAULT_REGION, ApiCall, isDynamicParameter, DynamicParameter, StaticParameter } from './service-config';

// Temp: restrict to single region
AWS.config.update({
  region: DEFAULT_REGION
});

const inMemDB: any = {};

/*
Thoughts on how to handle tricky dynamism in these dependencies:
Could split out API Call preparation (building out parameter object using lookups) from execution
Would also be useful to make a harsher split between dynamic and static parameters instead of co-locating
Maybe also introducing a third type to distinguish static, pure lookup, and *dynamic*
So workflow can become:
- Create initial parameter object containing static params
- Step through dynamic parameters
*/

interface FunctionParameters {
  [key: string]: any
};

// handler is downgraded to any instead of actual service types as strings cannot index into them
async function executeApiCall(handler: any, apiCall: ApiCall) {
  // build parameters
  const params: FunctionParameters = {};
  if(apiCall.staticParameters) {
    for(let { key, value } of apiCall.staticParameters) {
      params[key] = value;
    }
  }

  if(apiCall.lookupParameters) {
    for(let { key, sourceFunctionCall } of apiCall.lookupParameters) {
      params[key] = inMemDB[sourceFunctionCall];
    }
  }

  if(apiCall.dynamicParameter) {
    const { key, sourceFunctionCall, selector } = apiCall.dynamicParameter;
    const previousOutput = inMemDB[sourceFunctionCall];
    const selectedOutput = selector(previousOutput);

    for(let dynamicValue of (selectedOutput as Array<string>)) {
      params[key] = dynamicValue;
      const result = await handler[apiCall.functionName](params).promise();
      if(inMemDB[apiCall.functionName]) {
        inMemDB[apiCall.functionName].push(result);
      } else {
        inMemDB[apiCall.functionName] = [result];
      }
    }
  } else {
    const result = await handler[apiCall.functionName](params).promise();
    inMemDB[apiCall.functionName] = result;
  }
}

async function scanAwsAccount() {
  for(let { service, apiCalls } of servicesConfig){
    // Get service handler
    const serviceHandler = new AWS[service]();
    for(let apiCall of apiCalls) {
      await executeApiCall(serviceHandler, apiCall);
    }
  }
  console.log(JSON.stringify(inMemDB, undefined, 2));
}

console.log('Beginning account scan');
scanAwsAccount().then(() => {
  console.log('Account scan succeeded');
}).catch((err) => {
  console.error('Account scan failed', err);
});