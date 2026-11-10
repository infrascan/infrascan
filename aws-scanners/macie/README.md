# @infrascan/aws-macie-scanner

A scanner module for Amazon Macie (Macie2). It records whether Macie is turned on in each scanned account and region,
the session settings, how the account relates to its Macie administrator, where discovery results are stored, whether
automated discovery is on and, where the scanned account can read them, the organization-wide settings. It emits one
informational status node per account and region and no edges. Findings, jobs, buckets, statistics and usage are not
scanned.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Macie is a regional service (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `GetMacieSession` | The status call: session status, finding publishing frequency, service role, created and updated dates. |
| `GetAdministratorAccount` | `administratorAccountId` and `relationshipStatus` on a member account. Empty for an administrator or standalone account. |
| `ListOrganizationAdminAccounts` | Macie delegated administrators of the organization. |
| `DescribeOrganizationConfiguration` | Whether new organization accounts are auto-enabled, and whether the member limit was reached. |
| `ListMembers` | Member account id, relationship status, administrator id. Called with `onlyAssociated: "false"`. Emails are not kept. |
| `GetClassificationExportConfiguration` | S3 bucket, key prefix and KMS key that discovery results are written to. |
| `GetAutomatedDiscoveryConfiguration` | Automated sensitive data discovery status only. |

Which account can see what:

- Every account with Macie enabled can read its own session, administrator, export configuration and automated
  discovery status.
- `DescribeOrganizationConfiguration` and `ListMembers` return the organization's settings and members to the Macie
  administrator.
- `ListOrganizationAdminAccounts` is for the organization's management account, which does not need Macie enabled to
  call it. All calls are therefore made even when Macie is not enabled.

A call that fails is recorded with its error (see `CallState`) and listed in `serviceStatus.failedCalls`, so a denied
call is not mistaken for an empty result. Organization settings, members and admin accounts are absent from the node
when their call failed, and present (possibly empty) when it succeeded.

## Status

| Situation | `status` | `statusReason` |
| --- | --- | --- |
| Session `status` is `ENABLED` | `enabled` | — |
| Session `status` is `PAUSED` | `disabled` | — (raw status on `macie2.sessionStatus`) |
| `AccessDeniedException` whose message says Macie is not enabled | `disabled` | AWS's message |
| Any other error | `unknown` | error name |

## Graph

| Node | Id | Parent | Type |
| --- | --- | --- | --- |
| Status | `${account}-${region}-macie2` | scanned account id | `macie2-status` |

The status node is emitted whenever `GetMacieSession` was recorded for the account and region, including when Macie
is disabled or the call failed. It carries `serviceStatus` (shared by the governance scanners) and `macie2`
(`MacieDetails`). Organization settings sit on the node of the account that could read them. No administrator → member
edges are drawn: each member's `serviceStatus.administratorAccountId` records the relationship.
