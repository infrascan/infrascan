const jmespath = require('jmespath');
const { IAM_STORAGE } = require('../iam');
const {
	curryMinimatch,
	getServiceFromArn,
	evaluateSelectorGlobally,
} = require('../utils');
const { SERVICES_CONFIG: SERVICES } = require('../services');

function formatEdge(source, target, name, statement, roleArn) {
	const edgeId = `${source}:${target}`;
	return {
		group: 'edges',
		id: sanitizeId(edgeId),
		data: {
			id: edgeId,
			name,
			source,
			target,
			type: 'edge',
			info: {
				roleArn,
				label: name,
				statement,
			},
		},
	};
}

function getStatementsForRole(role) {
	const inlineStatements =
		jmespath.search(
			role,
			'inlinePolicies[].{label:PolicyName,statements:PolicyDocument.Statement[]}'
		) ?? [];
	const attachedStatements =
		jmespath.search(
			role,
			'attachedPolicies[].{label:PolicyName,statements:Document.Statement}'
		) ?? [];
	return {
		inlineStatements: inlineStatements.flatMap((x) => x),
		attachedStatements: attachedStatements.flatMap((x) => x),
	};
}

/**
 * Given a resource glob in an iam policy, resolves the relevant resources
 * @param {string} resourceArnFromPolicy
 * @returns {string[]} relevant arns
 */
async function resolveResourceGlob({
	resourceArnFromPolicy,
	getGlobalStateForServiceAndFunction,
}) {
	if (resourceArnFromPolicy === '*') {
		// TODO: use actions to infer which resources are impacted by a wildcard
		// E.g. Actions: [s3:GetObject], Resources: [*]
		return [];
	} else if (resourceArnFromPolicy.includes('*')) {
		const resourceService = getServiceFromArn(resourceArnFromPolicy);
		if (resourceService) {
			const serviceConfigs = SERVICES.filter(
				({ service, arnLabel }) =>
					(arnLabel ?? service).toLowerCase() === resourceService.toLowerCase()
			);
			if (serviceConfigs) {
				let serviceArns = [];
				for (let { nodes } of serviceConfigs) {
					if (!nodes || nodes.length === 0) {
						return [];
					}

					let globalState = [];
					for (let selector of nodes) {
						const selectedState = await evaluateSelectorGlobally(
							selector,
							getGlobalStateForServiceAndFunction
						);
						globalState = globalState.concat(selectedState);
					}
					const selectedNodes = globalState.map(({ id }) => id);
					// S3 Nodes use bucket names as they're globally unique, and the S3 API doesn't return ARNs
					// This means we need to build the ARN on the fly when matching in resource policies to allow partial
					// matches of <bucket-name> to <bucket-arn>/<object-path>
					if (resourceService === 's3') {
						serviceArns = serviceArns.concat(
							selectedNodes?.map((node) => `arn:aws:s3:::${node}`)
						);
					} else {
						serviceArns = serviceArns.concat(selectedNodes);
					}
				}
				return serviceArns
					.filter(curryMinimatch(resourceArnFromPolicy, { partial: true }))
					.map((node) => {
						// Because of S3 bucket names being converted into ARNs above
						// we need to split out the name from the ARN to get the correct edge
						if (resourceService === 's3') {
							return node.split(':').pop();
						} else {
							return node;
						}
					});
			}
		}
	} else {
		const resourceService = getServiceFromArn(resourceArnFromPolicy);
		const serviceConfigs = SERVICES.filter(
			({ service }) => service.toLowerCase() === resourceService.toLowerCase()
		);
		if (serviceConfigs) {
			let allServiceIds = [];
			for (let { nodes } of serviceConfigs) {
				if (nodes) {
					let nodeIds = [];
					for (let nodeSelector of nodes) {
						const selectedNodes = await evaluateSelectorGlobally(
							nodeSelector,
							getGlobalStateForServiceAndFunction
						);
						const selectedIds = selectedNodes.flatMap((resource) => {
							if (Array.isArray(resource)) {
								return resource.map(({ id }) => id);
							} else {
								return resource.id;
							}
						});
						nodeIds = nodeIds.concat(selectedIds);
					}
					allServiceIds = allServiceIds.concat(nodeIds);
				}
			}
			return allServiceIds.filter(
				(knownArn) => knownArn === resourceArnFromPolicy
			);
		}
	}
	return [];
}

/**
 * Takes inline or attached policy statements and returns the edges
 * @param {Object[]} policyStatements
 * @param {string[]} policyStatements.Resource
 * @returns {string[]}
 */
async function generateEdgesForPolicyStatements(
	policyStatements,
	getGlobalStateForServiceAndFunction
) {
	let resources = [];
	for (let { label, statements } of policyStatements) {
		for (let statement of statements) {
			const { Resource } = statement;
			if (Array.isArray(Resource)) {
				for (let resourceGlobs of Resource) {
					let resolvedState = await resolveResourceGlob({
						resourceArnFromPolicy: resourceGlobs,
						getGlobalStateForServiceAndFunction,
					});
					if (Array.isArray(resolvedState)) {
						resolvedState = resolvedState.map((node) => ({
							label,
							node,
							statement,
						}));
					} else {
						resolvedState = {
							node: resolvedState,
							label,
							statement,
						};
					}
					resources = resources.concat(resolvedState);
				}
			} else {
				let matchedResources = await resolveResourceGlob({
					resourceArnFromPolicy: Resource,
					getGlobalStateForServiceAndFunction,
				});
				if (Array.isArray(matchedResources)) {
					matchedResources = matchedResources.map((node) => ({
						label,
						node,
						statement,
					}));
				} else {
					matchedResources = {
						node: matchedResources,
						label,
						statement,
					};
				}
				resources = resources.concat(matchedResources);
			}
		}
	}
	return resources;
}

/**
 *
 * @param {string} arn
 * @param {string} roleExecutor - the arn of the resource using this role
 * @returns {Object[]} list of edge objects
 */
async function generateEdgesForRole(
	arn,
	executor,
	getGlobalStateForServiceAndFunction
) {
	const iamRole = IAM_STORAGE.getRole(arn);
	// Get role's policy statements
	const { inlineStatements, attachedStatements } =
		getStatementsForRole(iamRole);

	// Compute edges for inline policy statements
	const effectedResourcesForInlineStatements =
		await generateEdgesForPolicyStatements(
			inlineStatements,
			getGlobalStateForServiceAndFunction
		);

	// Compute edges for attached policy statements
	const effectedResourcesForAttachedStatements =
		await generateEdgesForPolicyStatements(
			attachedStatements,
			getGlobalStateForServiceAndFunction
		);

	// Iterate over the computed edges and format them
	return effectedResourcesForInlineStatements
		.concat(effectedResourcesForAttachedStatements)
		.map(({ label, node, statement }) =>
			formatEdge(executor, node, label, statement, arn)
		);
}

function sanitizeId(id) {
	return id
		.replaceAll(':', '-')
		.replaceAll('/', '')
		.replaceAll('\\', '')
		.replaceAll('.', '_');
}

module.exports = {
	formatEdge,
	generateEdgesForPolicyStatements,
	getStatementsForRole,
	generateEdgesForRole,
	sanitizeId,
};
