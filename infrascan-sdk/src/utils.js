const { STS } = require('aws-sdk');
const fs = require('fs');
const jmespath = require('jmespath');
const minimatch = require('minimatch');

const DEFAULT_REGION = 'us-east-1';

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
function evaluateSelector({
	account,
	region,
	rawSelector,
	resolveStateForServiceCall,
}) {
	const [service, functionCall, ...selector] = rawSelector.split('|');
	const state = resolveStateForServiceCall(
		account,
		region,
		service,
		functionCall
	);
	return jmespath.search(state, selector.join('|'));
}

/**
 * Takes a selector as defined in the services config file, and returns the result of
 * applying the selector on all relevant state files (any account, any region to allow for cross region relationships to show)
 * @param {String} rawSelector
 * @returns any
 */
function evaluateSelectorGlobally(
	rawSelector,
	getGlobalStateForServiceAndFunction
) {
	const [service, functionCall, ...selector] = rawSelector.split('|');
	const aggregateState = getGlobalStateForServiceAndFunction(
		service,
		functionCall
	);
	return jmespath.search(aggregateState, selector.join('|'));
}

function getServiceFromArn(arn) {
	const [_prefix, _aws, service] = arn.split(':');
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

// This function shouldn't exist, data structure should be updated
function splitServicesByGlobalAndRegional(services) {
	return services.reduce(
		(filteredServices, currentService) => {
			if (currentService.global) {
				filteredServices.global.push(currentService);
			} else {
				filteredServices.regional.push(currentService);
			}
			return filteredServices;
		},
		{ global: [], regional: [] }
	);
}

module.exports = {
	DEFAULT_REGION,
	evaluateSelector,
	whoami,
	getServiceFromArn,
	curryMinimatch,
	readStateFromFile,
	splitServicesByGlobalAndRegional,
	evaluateSelectorGlobally,
};