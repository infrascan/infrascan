const { STS } = require('aws-sdk');

function buildFilePathForServiceCall(account, region, service, functionCall) {
  return `./test-state/${account}-${region}-${service}-${functionCall}.json`;
}

async function whoami() {
  const stsClient = new STS();
  return await stsClient.getCallerIdentity().promise();
}

module.exports = {
  buildFilePathForServiceCall,
  whoami
}