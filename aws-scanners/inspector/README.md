# @infrascan/aws-inspector-scanner

A scanner module for Amazon Inspector (Inspector2). It records whether Inspector is turned on in each scanned account
and region, per resource type, which account is the organization's Inspector delegated administrator and, where the
scanned account can read them, the organization-wide settings. It emits one informational status node per account and
region and no edges. Findings, coverage, CIS scans, SBOM exports, usage and filters are not scanned.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Inspector is a regional service (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `BatchGetAccountStatus` | The status call. Called without `accountIds`, so AWS returns the caller's own overall state and per-resource-type state (`ec2`, `ecr`, `lambda`, `lambdaCode`, `codeRepository`). |
| `GetDelegatedAdminAccount` | The organization's Inspector delegated administrator and its relationship status, used as `administratorAccountId` and `relationshipStatus`. |
| `ListDelegatedAdminAccounts` | Every Inspector delegated administrator of the organization. |
| `DescribeOrganizationConfiguration` | Auto-enable per resource type, and whether the member limit was reached. |
| `ListMembers` | Member account id, relationship status, delegated administrator id. Called with `onlyAssociated: false`. |

Which account can see what: the SDK documentation does not say which caller each call is for. The expected callers
are: any account for `BatchGetAccountStatus` (its own status); the management account for
`ListDelegatedAdminAccounts`; the delegated administrator for `DescribeOrganizationConfiguration` and `ListMembers`.
Because this is not pinned down, every call is made from every account and whatever comes back is recorded.

A call that fails is recorded with its error (see `CallState`) and listed in `serviceStatus.failedCalls`, so a denied
call is not mistaken for an empty result. Organization settings, members and admin accounts are absent from the node
when their call failed, and present (possibly empty) when it succeeded.

## Status

From the caller's own entry in `BatchGetAccountStatus`:

| Situation | `status` | `statusReason` |
| --- | --- | --- |
| The call failed | `unknown` | error name |
| `state.status` is `ENABLED` | `enabled` | — |
| `state.status` is `DISABLED` or `SUSPENDED` | `disabled` | AWS `errorCode`, when given |
| `state.status` is `ENABLING`, `DISABLING` or `SUSPENDING` | `unknown` | AWS `errorCode`, else the status itself |
| Account listed under `failedAccounts`, or not returned | `unknown` | AWS `errorCode`, else `AccountNotReturned` |

The raw state objects are kept on `inspector2.state` and `inspector2.resourceState`.

## Graph

| Node | Id | Parent | Type |
| --- | --- | --- | --- |
| Status | `${account}-${region}-inspector2` | scanned account id | `inspector2-status` |

The status node is emitted whenever `BatchGetAccountStatus` was recorded for the account and region, including when
Inspector is disabled or the call failed. It carries `serviceStatus` (shared by the governance scanners) and
`inspector2` (`InspectorDetails`). Organization settings sit on the node of the account that could read them. No
administrator → member edges are drawn: each member's `serviceStatus.administratorAccountId` records the relationship.
