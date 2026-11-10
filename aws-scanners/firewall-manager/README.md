# @infrascan/aws-firewall-manager-scanner

A scanner module for AWS Firewall Manager. It records who administers Firewall Manager for an organization, the scope
each administrator was given, and the policies an administrator has defined with the accounts and OUs they include or
exclude. All nodes are informational.

Compliance, violations, protection status, application and protocol lists and resource sets are out of scope, as is
each policy's managed service data (its rules). This module is standalone: it is not registered by
[@infrascan/aws](../../packages/aws).

## What is scanned

Firewall Manager is regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `GetAdminAccount` | Status node: the organization's default administrator and its role status. |
| `ListAdminAccountsForOrganization` | Every administrator in the organization, with whether it is the default and its onboarding status. |
| `ListAdminsManagingAccount` | Administrators whose scope includes the scanned account. |
| `GetAdminScope` (per administrator listed above) | Each administrator's account, OU, region and policy type scope. |
| `ListPolicies`, `GetPolicy` | Policy nodes: name, ARN, security service type, resource type(s), remediation, delete-unused, `IncludeMap`/`ExcludeMap`, resource tag scope. |

Which account sees what:

- The **management account** can list every administrator and their scope (`ListAdminAccountsForOrganization`,
  `GetAdminScope` are management only).
- An **administrator account** lists the policies it defined (`ListPolicies`, `GetPolicy`).
- **Any account** can call `ListAdminsManagingAccount`; whether `GetAdminAccount` answers outside the management and
  administrator accounts depends on permissions.

A call that fails is recorded with its error (see `CallState`), so a denied call is not mistaken for an empty result.
Failed calls are listed on the status node in `serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`fms-status`) | `${account}-${region}-fms` | scanned account id |
| Policy (`fms-policy`) | policy ARN | scanned (administrator) account id |

The status node carries `serviceStatus` and `fms.status` (default administrator, role status, administrators managing
the account, and from the management account every administrator with its scope):

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `GetAdminAccount` returned an administrator, or either administrator listing returned one |
| `disabled` | `GetAdminAccount` failed with `ResourceNotFoundException` (AWS reports no administrator), or succeeded without one; `statusReason` carries the exception name |
| `unknown` | `GetAdminAccount` failed with any other error and no listing showed an administrator; `statusReason` is the error name |

`administratorAccountId` is the default administrator from `GetAdminAccount`, or the single administrator listed by
`ListAdminsManagingAccount` when `GetAdminAccount` did not return one. `relationshipStatus` is the administrator's
`RoleStatus`, verbatim.

Policy nodes carry `fms.policy`. A policy that `GetPolicy` could not read keeps the fields `ListPolicies` reported.

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `includes` | policy → account id in `IncludeMap.ACCOUNT` | — |
| `excludes` | policy → account id in `ExcludeMap.ACCOUNT` | — |

OU ids in `IncludeMap.ORG_UNIT` / `ExcludeMap.ORG_UNIT` and in administrator scopes are recorded as facts, since the
Organizations scanner keys OU nodes by ARN. An account named in both maps keeps one edge, `includes`; both maps are on
the node.
