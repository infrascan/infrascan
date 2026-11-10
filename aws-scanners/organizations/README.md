# @infrascan/aws-organizations-scanner

A scanner module for AWS Organizations. It records how an organization is structured and governed: the organization,
its roots, the OU tree, member accounts, policies and where they are attached, delegated administrators and trusted
service access. All nodes are informational.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Organizations is a global service (`callPerRegion: false`).

| Call | Used for |
| --- | --- |
| `DescribeOrganization` | Organization node: id, ARN, feature set, management account. Works from any member account. |
| `ListRoots` | Root nodes and the policy types enabled on them. |
| `ListOrganizationalUnitsForParent` | OU nodes, walked breadth first from each root. |
| `ListAccountsForParent` | Account nodes and the OU or root each account sits in. |
| `ListPolicies`, `DescribePolicy` | Policy nodes for every policy type enabled on a root, with the raw policy document. |
| `ListTargetsForPolicy` | `attached` edges from a policy to the roots, OUs and accounts it is directly attached to. |
| `ListDelegatedAdministrators`, `ListDelegatedServicesForAccount` | `delegated-administrator` edges from the organization to each delegated administrator account. |
| `ListAWSServiceAccessForOrganization` | Trusted service access on the organization node. |
| `DescribeResourcePolicy` | The resource policy that delegates Organizations itself (`resource.policy` on the organization node). |
| `ListTagsForResource` | Tags on roots, OUs and accounts. |

Everything except `DescribeOrganization` needs the management account or an account Organizations has been delegated
to. A call that fails is recorded with its error (see `CallState`), so a denied call is not mistaken for an empty
result. The organization node lists the calls that failed for the scanned account in
`organizations.organization.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Organization | organization ARN | — |
| Root | root ARN | organization ARN |
| Organizational unit | OU ARN | parent root or OU ARN |
| Account | account id | parent root or OU ARN |
| Policy | policy ARN | organization ARN, or none for AWS managed policies, which are shared by every organization |

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `attached` | policy → root, OU (ARN) or account (id) | `policyType`, `targetType` |
| `delegated-administrator` | organization → account | `services`: every service principal delegated to the account, with the delegation date |

Inherited policy attachments are not drawn; they follow from the containment of roots, OUs and accounts. Policies are
recorded as returned by AWS and are not parsed or evaluated.

When several accounts of one organization are scanned, each node is emitted by one scan only: the management account
if it was scanned, otherwise an account that could list the organization, otherwise the lowest account id. The
organization node records which kind of account it was observed from (`observedFrom`).
