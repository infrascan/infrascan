const AWS = require('aws-sdk');
const { scanResourcesInAccount } = require('./scan');
const { whoami } = require('./utils');
const DEFAULT_REGION = 'us-east-1';

AWS.config.update({
  region: DEFAULT_REGION
});

async function runScanner() {
  const caller = await whoami();
  await scanResourcesInAccount(caller.Account, DEFAULT_REGION);
}

runScanner();