# @infrascan/aws-identity-center-scanner

A scanner module for AWS IAM Identity Center. It records how workforce access is structured across an organization:
the Identity Center instance, its permission sets with the managed policies they attach or reference, and the
accounts each permission set is provisioned to. All nodes are informational.

Inline policy documents, account assignments and their principals, users and groups are out of scope. This module is
standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Identity Center is regional (`callPerRegion: true`): an instance is listed in its primary region, and in any further
regions it has been extended to.

| Call | Used for |
| --- | --- |
| `ListInstances` | Status node and instance nodes: instance ARN, identity store id, owner account id, name, status, regions, created date. |
| `ListPermissionSets` (per instance) | Permission set nodes. |
| `DescribePermissionSet` | Name, description, session duration, relay state, created date. |
| `ListManagedPoliciesInPermissionSet` | Names and ARNs of the AWS managed policies attached to each permission set. |
| `ListCustomerManagedPolicyReferencesInPermissionSet` | Names and paths of the customer managed policies each permission set references. |
| `ListAccountsForProvisionedPermissionSet` | `provisioned-to` edges. |

Which account sees what:

- The **management account** lists the organization instance (its `OwnerAccountId` is the management account) and
  everything under it.
- A **delegated administrator** for Identity Center lists the same organization instance, still owned by the
  management account.
- Any **other account** lists only an account instance it created itself, if any (`OwnerAccountId` is that account).

The scanner records `OwnerAccountId` as reported and does not classify instances. A call that fails is recorded with
its error (see `CallState`), so a denied call is not mistaken for an empty result. Failed calls are listed on the
status node in `serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`identitycenter-status`) | `${account}-${region}-identitycenter` | scanned account id |
| Instance (`identitycenter-instance`) | instance ARN | scanned account id |
| Permission set (`identitycenter-permission-set`) | permission set ARN (`instanceArn` recorded as a fact) | scanned account id |

The status node carries `serviceStatus` and `identitycenter.status.instances` (ARN, name, identity store id, owner
account id, status, primary region of every instance listed in that region):

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `ListInstances` returned an instance in this region |
| `disabled` | `ListInstances` succeeded and returned none |
| `unknown` | `ListInstances` failed; `statusReason` is the error name |

A permission set that could not be described still has a node, labelled by its ARN.

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `provisioned-to` | permission set → account id | — |

An organization instance can be listed by the management account and a delegated administrator, and a multi-region
instance in each of its regions. Each instance and permission set node is emitted by one scan only: the owner account
if it was scanned, otherwise the lowest account id; within that account the instance's primary region if it was
scanned, otherwise the lowest region. Every scan still emits its own status node, and edges from all scans are merged.
