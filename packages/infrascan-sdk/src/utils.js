import { STS } from '@aws-sdk/client-sts';
import jmespath from 'jmespath';
import minimatch from 'minimatch';

export const DEFAULT_REGION = 'us-east-1';

/**
 *
 * @param {import('@aws-sdk/types').AwsCredentialIdentityProvider} credentials
 * @param {string} region
 * @returns {import('@aws-sdk/client-sts').GetCallerIdentityCommandOutput}
 */
export async function whoami(credentials, region) {
	const stsClient = new STS({
		credentials,
		region,
	});
	return await stsClient.getCallerIdentity();
}

/**
 * Takes a selector as defined in the services config file, an account, and region, and returns the result of
 * applying the selector on the relevant state file
 * @param {object} config
 * @param {string} config.account
 * @param {string} config.region
 * @param {string} config.rawSelector
 * @param {function} config.resolveStateForServiceCall
 * @returns any
 */
export async function evaluateSelector({
	account,
	region,
	rawSelector,
	resolveStateForServiceCall,
}) {
	const [service, functionCall, ...selector] = rawSelector.split('|');
	const state = await resolveStateForServiceCall(
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
export async function evaluateSelectorGlobally(
	rawSelector,
	getGlobalStateForServiceAndFunction
) {
	const [service, functionCall, ...selector] = rawSelector.split('|');
	const aggregateState = await getGlobalStateForServiceAndFunction(
		service,
		functionCall
	);
	return jmespath.search(aggregateState, selector.join('|'));
}

/**
 * Split out an arn to find the resources service
 * @param {string} arn
 * @returns {string | undefined}
 */
export function getServiceFromArn(arn) {
	const [_prefix, _aws, service] = arn.split(':');
	return service;
}

export function curryMinimatch(glob, opts) {
	return (comparisonString) => minimatch(comparisonString, glob, opts ?? {});
}

export async function createDynamicClient(service, clientKey, config) {
	const serviceModule = await import(`@aws-sdk/client-${service}`);
	return new serviceModule[clientKey](config ?? {});
}

export async function invokeDynamicClient(client, functionKey) {
	const functionArguments = Array.from(arguments).slice(2);
	return await client[functionKey](...functionArguments);
}
