import {
	REGIONAL_SERVICES,
	GLOBAL_SERVICES,
	ServiceConfig,
	ServiceGetter,
	ParameterResolver,
} from './scrapers/services';
import type { ServiceClients } from './scrapers/client';
import { dynamicClient } from './scrapers/client';
import jmespath from 'jmespath';
import {
	whoami,
	evaluateSelector,
	DEFAULT_REGION,
	invokeDynamicClient,
} from './utils';
import { scanIamRole, IAMStorage } from './iam';
const ERROR_CODES_TO_IGNORE = ['NoSuchWebsiteConfiguration', 'NoSuchTagSet'];

type ResolveParametersOptions = {
	account: string;
	region: string;
	parameters: ParameterResolver[];
	resolveStateForServiceCall: ResolveStateFromServiceFn;
};

async function resolveParameters({
	account,
	region,
	parameters,
	resolveStateForServiceCall,
}: ResolveParametersOptions): Promise<Record<string, any>[]> {
	let allParamObjects: Record<string, string>[] = [];
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

type MakeFunctionCallOptions = {
	account: string;
	region: string;
	service: string;
	client: ServiceClients;
	iamClient: IAM;
	functionCall: ServiceGetter;
	resolveStateForServiceCall: ResolveStateFromServiceFn;
	iamStorage: IAMStorage;
};
async function makeFunctionCall({
	account,
	region,
	service,
	client,
	iamClient,
	functionCall,
	resolveStateForServiceCall,
	iamStorage,
}: MakeFunctionCallOptions) {
	const { fn, paginationToken, parameters, formatter, iamRoleSelectors } =
		functionCall;
	let resolvedParameters: Record<string, any>[] = [{}];
	if (parameters) {
		resolvedParameters = await resolveParameters({
			account,
			region,
			parameters,
			resolveStateForServiceCall,
		});
	}

	const state: GenericState[] = [];
	for (let requestParameters of resolvedParameters) {
		try {
			console.log(`${service} ${fn}`);
			let pagingToken = undefined;
			do {
				if (paginationToken?.request != null) {
					requestParameters[paginationToken.request] = pagingToken;
				}
				const result =
					(await invokeDynamicClient(client, fn, requestParameters)) ?? {};
				if (paginationToken?.response != null) {
					pagingToken = result[paginationToken?.response];
				}

				const formattedResult = formatter ? formatter(result) : result;

				if (iamRoleSelectors) {
					for (let selector of iamRoleSelectors) {
						const selectionResult = jmespath.search(formattedResult, selector);
						if (Array.isArray(selectionResult)) {
							for (let roleArn of selectionResult) {
								await scanIamRole(iamStorage, iamClient, roleArn);
							}
						} else if (selectionResult) {
							await scanIamRole(iamStorage, iamClient, selectionResult);
						}
					}
				}

				// using `_` prefix to avoid issues with jmespath and dollar signs
				state.push({
					// track context in metadata to allow mapping to parents
					_metadata: { account, region },
					_parameters: requestParameters,
					_result: formattedResult,
				});
			} while (pagingToken != null);
		} catch (err: any) {
			if (err?.retryable) {
				console.log('Encountered retryable error', err);
			} else if (!ERROR_CODES_TO_IGNORE.includes(err?.code)) {
				console.log('Non retryable error', err);
			}
		}
	}
	return state;
}

export type ScanResourcesInAccountOptions = {
	account: string;
	region: string;
	servicesToScan: ServiceConfig[];
	onServiceScanComplete: ServiceScanCompleteCallbackFn;
	resolveStateForServiceCall: ResolveStateFromServiceFn;
	iamStorage: IAMStorage;
};

import { IAM } from '@aws-sdk/client-iam';
async function scanResourcesInAccount({
	account,
	region,
	servicesToScan,
	onServiceScanComplete,
	resolveStateForServiceCall,
	iamStorage,
}: ScanResourcesInAccountOptions): Promise<void> {
	const iamClient = new IAM({ region });
	for (let serviceScanner of servicesToScan) {
		const { service, clientKey, getters } = serviceScanner;

		const client = await dynamicClient(service, clientKey, { region });

		for (let functionCall of getters) {
			const functionState = await makeFunctionCall({
				account,
				region,
				service,
				client,
				iamClient,
				functionCall,
				resolveStateForServiceCall,
				iamStorage,
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
		iamStorage.getAllRoles()
	);
}

import { EC2 } from '@aws-sdk/client-ec2';
async function getAllRegions(
	credentials: AwsCredentialIdentityProvider
): Promise<string[]> {
	const ec2Client = new EC2({ region: DEFAULT_REGION, credentials });
	const { Regions } = await ec2Client.describeRegions({ AllRegions: true });
	return Regions?.map(({ RegionName }) => RegionName as string) ?? [];
}

import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { GenericState } from './graphTypes';
export type ServiceScanCompleteCallbackFn = (
	account: string,
	region: string,
	service: string,
	functionName: string,
	functionState: any
) => void;
export type ResolveStateFromServiceFn = (
	account: string,
	region: string,
	service: string,
	functionName: string
) => void;
export type PerformScanOptions = {
	credentials: AwsCredentialIdentityProvider;
	regions?: string[];
	services?: string[];
	onServiceScanComplete: ServiceScanCompleteCallbackFn;
	resolveStateForServiceCall: ResolveStateFromServiceFn;
};

export type ScanMetadata = {
	account: string;
	regions: string[];
};

export async function performScan({
	credentials,
	regions,
	services,
	onServiceScanComplete,
	resolveStateForServiceCall,
}: PerformScanOptions) {
	const globalCaller = await whoami(credentials, DEFAULT_REGION);

	if (globalCaller?.Account == null) {
		throw new Error('Failed to get caller identity');
	}

	const scanMetadata: ScanMetadata = {
		account: globalCaller?.Account,
		regions: [],
	};

	const iamStorage = new IAMStorage();
	console.log(`Scanning global resources in ${globalCaller.Account}`);
	if (services?.length != null && services?.length > 0) {
		const filteredGlobalServices = GLOBAL_SERVICES.filter(({ service }) =>
			services.includes(service)
		);
		await scanResourcesInAccount({
			account: globalCaller.Account,
			region: 'us-east-1',
			servicesToScan: filteredGlobalServices,
			onServiceScanComplete,
			resolveStateForServiceCall,
			iamStorage,
		});
	} else {
		await scanResourcesInAccount({
			account: globalCaller.Account,
			region: 'us-east-1',
			servicesToScan: GLOBAL_SERVICES,
			onServiceScanComplete,
			resolveStateForServiceCall,
			iamStorage,
		});
	}

	const regionsToScan = regions ?? (await getAllRegions(credentials));

	for (let region of regionsToScan) {
		const caller = await whoami(credentials, region);
		if (caller.Account == null) {
			throw new Error('Failed to get caller identity');
		}
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
				iamStorage,
			});
		} else {
			await scanResourcesInAccount({
				account: caller.Account,
				region,
				servicesToScan: REGIONAL_SERVICES,
				onServiceScanComplete,
				resolveStateForServiceCall,
				iamStorage,
			});
		}
		console.log(`Scan of ${caller.Account} in ${region} complete`);
		scanMetadata.regions.push(region);
	}
	return scanMetadata;
}
