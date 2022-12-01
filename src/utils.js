const { STS } = require("aws-sdk");
const fs = require("fs");
const jmespath = require("jmespath");
const minimatch = require("minimatch");

const OUTPUT_DIR = process.env.OUTPUT_DIR || "state";
const METADATA_PATH = `./${OUTPUT_DIR}/metadata.json`;

function buildFilePathForServiceCall(account, region, service, functionCall) {
  return `./${OUTPUT_DIR}/${account}-${region}-${service}-${functionCall}.json`;
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
  const [service, functionCall, ...selector] = rawSelector.split("|");

  const filePath = buildFilePathForServiceCall(
    account,
    region,
    service,
    functionCall
  );
  const state = fs.readFileSync(filePath, "utf8");
  return jmespath.search(JSON.parse(state), selector.join("|"));
}

function getServiceFromArn(arn) {
  const [_prefix, _aws, service] = arn.split(":");
  return service;
}

function curryMinimatch(glob, opts) {
  return (comparisonString) => minimatch(comparisonString, glob, opts ?? {});
}

function readStateFromFile(accountId, region, serviceName, functionCall) {
  const fileName = buildFilePathForServiceCall(
    accountId,
    region,
    serviceName,
    functionCall
  );
  const contents = fs.readFileSync(fileName);
  return JSON.parse(contents.toString());
}

module.exports = {
  METADATA_PATH,
  buildFilePathForServiceCall,
  evaluateSelector,
  whoami,
  getServiceFromArn,
  curryMinimatch,
  readStateFromFile,
};
