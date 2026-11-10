# @infrascan/aws-detective-scanner

A scanner module for Amazon Detective. It records, per account and region, whether Detective is in use, the behavior
graphs the account administers or belongs to, and the organization settings it can read. It gathers information only:
no investigations, indicators, findings or usage statistics are recorded. All nodes are informational.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Detective is regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `ListGraphs` | Behavior graphs the account is the administrator of. Decides the status. |
| `ListMembers` | Per graph: member account id, administrator id, membership status, invitation type, data source package ingest states. Email addresses and volume usage are not recorded. |
| `DescribeOrganizationConfiguration` | Per graph: whether new organization accounts are enabled automatically (`organizationAutoEnable`). |
| `ListDatasourcePackages` | Per graph: each data source package and its ingest state. |
| `ListOrganizationAdminAccounts` | The organization's Detective administrator account. |
| `ListInvitations` | Graphs the account is invited to or a member of: graph ARN, administrator id, status. Decides the status and the administrator relationship. |

Which account can see what:

- The graph administrator (for an organization, the Detective delegated administrator) sees its graph, members, data
  source packages and, for an organization graph, the auto-enable setting. The per-graph calls are only made for
  graphs `ListGraphs` returned.
- Only the organization management account can call `ListOrganizationAdminAccounts`.
- A member account sees its own membership through `ListInvitations`.

A call that fails is recorded with its error (see `CallState`) and listed in `serviceStatus.failedCalls`, so a denied
call is not mistaken for an empty result. Organization-wide settings and member lists are facts on the status node of
the account that could read them; no administrator → member edges are drawn, since every member's node records its
`administratorAccountId`.

## Status

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `ListGraphs` returned a graph, or `ListInvitations` returned a membership with status `ENABLED`. |
| `disabled` | Both calls succeeded and neither shows a graph or an enabled membership. `statusReason` is the membership's `DisabledReason` when AWS gives one. |
| `unknown` | Neither of the above, and `ListGraphs` or `ListInvitations` failed. `statusReason` is the error name. |

`administratorAccountId` and `relationshipStatus` come from the account's membership: the `ENABLED` one if there is
one, otherwise the first one listed.

## Graph

| Node | Id | Parent | Detail |
| --- | --- | --- | --- |
| Detective status (`detective-status`) | `${account}-${region}-detective` | scanned account id | `serviceStatus`, `detective` (`graphs`, `memberships`, `organizationAdminAccounts`) |

One status node is emitted per scanned account and region, whatever the status. No edges are emitted.
