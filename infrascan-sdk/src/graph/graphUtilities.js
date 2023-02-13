const jmespath = require('jmespath');
const { IAM_STORAGE } = require('../iam');
const {
	curryMinimatch,
	getServiceFromArn,
	evaluateSelectorGlobally,
} = require('../utils');
const { SERVICES_CONFIG: SERVICES } = require('../services');

function formatEdge(source, target, name) {
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
		},
	};
}

function getStatementsForRole(role) {
	const inlineStatements =
		jmespath.search(role, 'inlinePolicies[].PolicyDocument.Statement[]') ?? [];
	const attachedStatements =
		jmespath.search(role, 'attachedPolicies[].Document.Statement') ?? [];
	return {
		inlineStatements,
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
				const serviceArns = await Promise.all(
					serviceConfigs.flatMap(async ({ nodes }) => {
						if (!nodes || nodes.length === 0) {
							return [];
						}
						const selectedNodes = (
							await Promise.all(
								nodes.flatMap((nodeSelector) =>
									evaluateSelectorGlobally(
										nodeSelector,
										getGlobalStateForServiceAndFunction
									)
								)
							)
						).map(({ id }) => id);
						// S3 Nodes use bucket names as they're globally unique, and the S3 API doesn't return ARNs
						// This means we need to build the ARN on the fly when matching in resource policies to allow partial
						// matches of <bucket-name> to <bucket-arn>/<object-path>
						if (resourceService === 's3') {
							return selectedNodes?.map((node) => `arn:aws:s3:::${node}`);
						}
						return selectedNodes;
					})
				);
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
			const serviceArns = await Promise.all(
				serviceConfigs.flatMap(async ({ nodes }) => {
					if (nodes) {
						return (
							await Promise.all(
								nodes.flatMap((nodeSelector) =>
									evaluateSelectorGlobally(
										nodeSelector,
										getGlobalStateForServiceAndFunction
									)
								)
							)
						).map(({ id }) => id);
					} else {
						return [];
					}
				})
			);
			return serviceArns.filter(
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
	return await Promise.all(
		policyStatements.flatMap(({ Resource }) => {
			if (Array.isArray(Resource)) {
				return Resource.flatMap((resourceGlobs) =>
					resolveResourceGlob({
						resourceArnFromPolicy: resourceGlobs,
						getGlobalStateForServiceAndFunction,
					})
				);
			} else {
				return resolveResourceGlob({
					resourceArnFromPolicy: Resource,
					getGlobalStateForServiceAndFunction,
				});
			}
		})
	);
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
		.map((effectedArn) =>
			formatEdge(executor, effectedArn, `${executor}:${effectedArn}`)
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
