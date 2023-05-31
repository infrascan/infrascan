import jmespath from "jmespath";

export const DEFAULT_REGION = "us-east-1";

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
  const [service, functionCall, ...selector] = rawSelector.split("|");
  const state = await resolveStateForServiceCall(
    account,
    region,
    service,
    functionCall
  );
  return jmespath.search(state, selector.join("|"));
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
  const [service, functionCall, ...selector] = rawSelector.split("|");
  const aggregateState = await getGlobalStateForServiceAndFunction(
    service,
    functionCall
  );
  return jmespath.search(aggregateState, selector.join("|"));
}

export async function createDynamicClient(service, clientKey, config) {
  const serviceModule = await import(`@aws-sdk/client-${service}`);
  return new serviceModule[clientKey](config ?? {});
}

export async function invokeDynamicClient(client, functionKey) {
  const functionArguments = Array.from(arguments).slice(2);
  return await client[functionKey](...functionArguments);
}
