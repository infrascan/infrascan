const { STS } = require("aws-sdk");
const fs = require("fs");
const jmespath = require("jmespath");

function buildFilePathForServiceCall(account, region, service, functionCall) {
  return `./test-state/${account}-${region}-${service}-${functionCall}.json`;
}

async function whoami() {
  const stsClient = new STS();
  return await stsClient.getCallerIdentity().promise();
}

/**
 * Takes a selector as defined in the services config file, an account, and region, and returns the result of
 * applying the selector on the relevant state file
 * @param {String} rawSelector
 * @returns any
 */
function evaluateSelector(account, region, rawSelector) {
  const [service, functionCall, selector] = rawSelector.split("|");

  const filePath = buildFilePathForServiceCall(
    account,
    region,
    service,
    functionCall
  );
  const state = fs.readFileSync(filePath, "utf8");
  return jmespath.search(JSON.parse(state), selector);
}

module.exports = {
  buildFilePathForServiceCall,
  evaluateSelector,
  whoami,
};
