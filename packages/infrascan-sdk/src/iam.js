export function parseRoleName(roleArn) {
	const lastToken = roleArn.split(':').pop();
	return lastToken?.split('/').pop();
}

export function decodePolicy(policyDoc) {
	const decodedPolicy = decodeURIComponent(policyDoc);
	return JSON.parse(decodedPolicy);
}

export const IAM_STORAGE = {
	data: {},
	/**
	 * Set a role in storage
	 * @param {string} arn
	 * @param {Object} role
	 */
	setRole: function (arn, role) {
		this.data[arn] = role;
	},
	/**
	 * Get a role from storage
	 * @param {string} arn
	 * @returns {Object | undefined}
	 */
	getRole: function (arn) {
		return this.data[arn];
	},
	/**
	 * Get all roles from storage
	 * @returns {Object[]}
	 */
	getAllRoles: function () {
		return Object.values(this.data);
	},
	/**
	 * Delete all stored roles
	 * @type {function}
	 */
	clearAllRoles: function () {
		this.data = {};
	},
};

export function hydrateRoleStorage(roles) {
	for (let role of roles) {
		IAM_STORAGE.setRole(role.roleArn, role);
	}
}

export function clearRoleStorage() {
	IAM_STORAGE.clearAllRoles();
}

export async function scanIamRole(iamClient, roleArn) {
	const roleName = parseRoleName(roleArn);
	const prescannedRole = IAM_STORAGE.getRole(roleArn);
	if (prescannedRole) {
		return;
	}
	// Init role state
	const iamState = {};
	iamState['roleArn'] = roleArn;
	if (roleName) {
		iamState['roleName'] = roleName;

		// Retrieve base info about Role, main insight being the trust relationship
		const baseRoleInfo = await iamClient
			.getRole({ RoleName: roleName })
			.promise();
		if (baseRoleInfo?.Role?.AssumeRolePolicyDocument) {
			baseRoleInfo.Role.AssumeRolePolicyDocument = decodePolicy(
				baseRoleInfo.Role.AssumeRolePolicyDocument
			);
		}
		iamState['role'] = baseRoleInfo?.Role;

		// Pull info about the role's inline policies
		const rolePolicies = await iamClient
			.listRolePolicies({ RoleName: roleName })
			.promise();
		const inlinePolicies = [];
		for (let policy of rolePolicies.PolicyNames) {
			const policyInfo = await iamClient
				.getRolePolicy({ RoleName: roleName, PolicyName: policy })
				.promise();
			const formattedPolicyInfo = {
				RoleName: policyInfo.RoleName,
				PolicyName: policyInfo.PolicyName,
				PolicyDocument: decodePolicy(policyInfo.PolicyDocument),
			};
			inlinePolicies.push(formattedPolicyInfo);
		}
		iamState['inlinePolicies'] = inlinePolicies;

		// Pull info about the role's attached policies
		const attachedPolicies = [];
		const attachedPoliciesForRole = await iamClient
			.listAttachedRolePolicies({ RoleName: roleName })
			.promise();
		for (let policy of attachedPoliciesForRole.AttachedPolicies ?? []) {
			if (policy.PolicyArn) {
				const attachedPolicy = await iamClient
					.getPolicy({ PolicyArn: policy.PolicyArn })
					.promise();

				// Pull the specific policy version to get the embedded document
				if (attachedPolicy.Policy?.DefaultVersionId) {
					const policyVersion = await iamClient
						.getPolicyVersion({
							PolicyArn: policy.PolicyArn,
							VersionId: attachedPolicy.Policy?.DefaultVersionId,
						})
						.promise();
					const formattedVersion = {
						...attachedPolicy.Policy,
						...policyVersion.PolicyVersion,
					};
					if (formattedVersion.Document) {
						formattedVersion.Document = decodePolicy(formattedVersion.Document);
					}
					attachedPolicies.push(formattedVersion);
				} else {
					attachedPolicies.push(attachedPolicy.Policy);
				}
			}
		}
		iamState['attachedPolicies'] = attachedPolicies;
	}
	IAM_STORAGE.setRole(roleArn, iamState);
}
