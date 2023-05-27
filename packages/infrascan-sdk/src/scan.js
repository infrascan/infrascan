const AWS = require('aws-sdk');
const { SERVICES_CONFIG: SERVICES } = require('./services');
const jmespath = require('jmespath');
const {
	whoami,
	evaluateSelector,
	DEFAULT_REGION,
	splitServicesByGlobalAndRegional,
} = require('./utils');
const { scanIamRole, IAM_STORAGE } = require('./iam');
const ERROR_CODES_TO_IGNORE = ['NoSuchWebsiteConfiguration', 'NoSuchTagSet'];

const { global: GLOBAL_SERVICES, regional: REGIONAL_SERVICES } =
	splitServicesByGlobalAndRegional(SERVICES);

async function resolveParameters({
	account,
	region,
	parameters,
	resolveStateForServiceCall,
}) {
	let allParamObjects = [];
	for (let { Key, Selector, Value } of parameters) {
		if (Selector) {
			const parameterValues = await evaluateSelector({
				account,
				region,
				rawSelector: Selector,
				resolveStateForServiceCall,
			});
			for (let idx = 0; idx < parameterValues.length; idx++) {
				if (allParamObjects[idx] == null) {
					allParamObjects[idx] = {};
				}
				allParamObjects[idx][Key] = parameterValues[idx];
			}
		} else if (Value) {
			if (allParamObjects.length === 0) {
				allParamObjects.push({ [Key]: Value });
			} else {
				for (let parameterObject of allParamObjects) {
					parameterObject[Key] = Value;
				}
			}
		}
	}
	const validatedParamObjects = allParamObjects.filter((obj) => {
		const allParamsPresent = parameters.every(({ Key }) =>
			Object.keys(obj).includes(Key)
		);
		return allParamsPresent;
	});
	return validatedParamObjects;
}

async function makeFunctionCall({
	account,
	region,
	service,
	client,
	iamClient,
	functionCall,
	resolveStateForServiceCall,
}) {
	const { fn, paginationToken, parameters, formatter, iamRoleSelectors } =
		functionCall;
	const params = parameters
		? await resolveParameters({
				account,
				region,
				parameters,
				resolveStateForServiceCall,
		  })
		: [{}];

	const state = [];
	for (let paramObj of params) {
		try {
			console.log(`${service} ${fn}`);
			let pagingToken = undefined;
			do {
				const params = Object.assign(paramObj, {
					[paginationToken?.request]: pagingToken,
				});
				const result = (await client[fn](params).promise()) ?? {};
				pagingToken = result[paginationToken?.response];

				const formattedResult = formatter ? formatter(result) : result;

				if (iamRoleSelectors) {
					for (let selector of iamRoleSelectors) {
						const selectionResult = jmespath.search(formattedResult, selector);
						if (Array.isArray(selectionResult)) {
							for (let roleArn of selectionResult) {
								await scanIamRole(iamClient, roleArn);
							}
						} else if (selectionResult) {
							await scanIamRole(iamClient, selectionResult);
						}
					}
				}

				// using `_` prefix to avoid issues with jmespath and dollar signs
				state.push({
					// track context in metadata to allow mapping to parents
					_metadata: { account, region },
					_parameters: paramObj,
					_result: formattedResult,
				});
			} while (pagingToken != null);
		} catch (err) {
			if (err.retryable) {
				// TODO: impl retryable
				console.log('Encountered retryable error', err);
			} else if (!ERROR_CODES_TO_IGNORE.includes(err.code)) {
				console.log('Non retryable error', err);
			}
		}
	}
	return state;
}

async function scanResourcesInAccount({
	account,
	region,
	servicesToScan,
	onServiceScanComplete,
	resolveStateForServiceCall,
}) {
	const iamClient = new AWS.IAM();
	for (let serviceScanner of servicesToScan) {
		const { service, getters } = serviceScanner;

		const client = new AWS[service]({
			region,
		});

		for (let functionCall of getters) {
			const functionState = await makeFunctionCall({
				account,
				region,
				service,
				client,
				iamClient,
				functionCall,
				resolveStateForServiceCall,
			});
			await onServiceScanComplete(
				account,
				region,
				service,
				functionCall.fn,
				functionState
			);
		}
	}
	await onServiceScanComplete(
		account,
		region,
		'IAM',
		'roles',
		IAM_STORAGE.getAllRoles()
	);
}

async function getAllRegions() {
	const ec2Client = new AWS.EC2();
	const { Regions } = await ec2Client.describeRegions().promise();
	return Regions.map(({ RegionName }) => RegionName);
}

async function assumeRole(roleToAssume) {
	const sts = new AWS.STS();
	console.log('Assuming Role', roleToAssume);
	const { Credentials } = await sts
		.assumeRole({ RoleArn: roleToAssume, RoleSessionName: 'infrascan' })
		.promise();
	console.log('Assumed Role', roleToAssume);
	return {
		accessKeyId: Credentials.AccessKeyId,
		secretAccessKey: Credentials.SecretAccessKey,
		sessionToken: Credentials.SessionToken,
	};
}

async function performScan({
	credentials,
	roleToAssume,
	regions,
	services,
	onServiceScanComplete,
	resolveStateForServiceCall,
}) {
	const scanMetadata = {};

	// If credentials have a getter, assume they're AWS credentials, else assume they're the raw credentials
	const awsCredentials =
		typeof credentials.get === 'function'
			? credentials
			: new AWS.Credentials(credentials);
	AWS.config.update({ credentials: awsCredentials, region: DEFAULT_REGION });
	if (roleToAssume) {
		const credentials = await assumeRole(roleToAssume);
		AWS.config.update({ credentials });
	}
	const globalCaller = await whoami();
	scanMetadata.account = globalCaller.Account;
	scanMetadata.regions = [];

	console.log(`Scanning global resources in ${globalCaller.Account}`);
	if (services?.length > 0) {
		const filteredGlobalServices = GLOBAL_SERVICES.filter(({ service }) =>
			services.includes(service)
		);
		await scanResourcesInAccount({
			account: globalCaller.Account,
			region: 'us-east-1',
			servicesToScan: filteredGlobalServices,
			onServiceScanComplete,
			resolveStateForServiceCall,
		});
	} else {
		await scanResourcesInAccount({
			account: globalCaller.Account,
			region: 'us-east-1',
			servicesToScan: GLOBAL_SERVICES,
			onServiceScanComplete,
			resolveStateForServiceCall,
		});
	}

	const regionsToScan = regions ?? (await getAllRegions());

	for (let region of regionsToScan) {
		AWS.config.update({
			region,
		});
		const caller = await whoami();
		console.log(`Beginning scan of ${caller.Account} in ${region}`);
		const servicesToScan = services ?? [];
		if (servicesToScan.length > 0) {
			console.log(`Filtering services according to supplied list`, {
				servicesToScan,
			});
			const filteredRegionalServices = REGIONAL_SERVICES.filter(({ service }) =>
				servicesToScan.includes(service)
			);
			await scanResourcesInAccount({
				account: caller.Account,
				region,
				servicesToScan: filteredRegionalServices,
				onServiceScanComplete,
				resolveStateForServiceCall,
			});
		} else {
			await scanResourcesInAccount({
				account: caller.Account,
				region,
				servicesToScan: REGIONAL_SERVICES,
				onServiceScanComplete,
				resolveStateForServiceCall,
			});
		}
		console.log(`Scan of ${caller.Account} in ${region} complete`);
		scanMetadata.regions.push(region);
	}
	return scanMetadata;
}

module.exports = {
	performScan,
};
