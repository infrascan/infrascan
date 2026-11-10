# @infrascan/aws-guardduty-scanner

A scanner module for Amazon GuardDuty. It records whether GuardDuty is turned on in each scanned account and region,
how the detector is configured, how the account relates to its GuardDuty administrator and, where the scanned account
can read them, the organization-wide settings. It emits one informational status node per account and region and no
edges. Findings, filters, IP sets, threat intel sets, coverage, usage and malware scans are not scanned.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

GuardDuty is a regional service (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `ListDetectors` | The status call. GuardDuty allows one detector per account per region. |
| `GetDetector` | Detector status, features and their additional configuration, finding publishing frequency, service role, created and updated dates. |
| `GetAdministratorAccount` | `administratorAccountId` and `relationshipStatus` on a member account. Empty for an administrator or standalone account. |
| `DescribeOrganizationConfiguration` | `AutoEnableOrganizationMembers`, per-feature auto-enable. Paginated over features. |
| `ListMembers` | Member account id, detector id, relationship status, administrator id. Called with `OnlyAssociated: "false"`. Emails are not kept. |
| `ListPublishingDestinations`, `DescribePublishingDestination` | Finding export destinations: type, status, destination ARN, KMS key ARN. |
| `ListOrganizationAdminAccounts` | GuardDuty delegated administrators for the region. |

Which account can see what:

- Every account with a detector can read its own detector, administrator and publishing destinations.
- `DescribeOrganizationConfiguration` and `ListMembers` return the organization's settings and members to the
  GuardDuty delegated administrator.
- `ListOrganizationAdminAccounts` is for the organization's management account only.

A call that fails is recorded with its error (see `CallState`) and listed in `serviceStatus.failedCalls`, so a denied
call is not mistaken for an empty result. Organization settings, members and admin accounts are absent from the node
when their call failed, and present (possibly empty) when it succeeded.

## Status

| Situation | `status` | `statusReason` |
| --- | --- | --- |
| `ListDetectors` failed | `unknown` | error name |
| No detector | `disabled` | — |
| `GetDetector` failed | `unknown` | error name |
| Detector `Status` is `ENABLED` | `enabled` | — |
| Detector `Status` is `DISABLED` (also how a suspended detector is reported) | `disabled` | — |

## Graph

| Node | Id | Parent | Type |
| --- | --- | --- | --- |
| Status | `${account}-${region}-guardduty` | scanned account id | `guardduty-status` |

The status node is emitted whenever `ListDetectors` was recorded for the account and region, including when GuardDuty
is disabled or the call failed. It carries `serviceStatus` (shared by the governance scanners) and `guardduty`
(`GuardDutyDetails`). Organization settings sit on the node of the account that could read them. No administrator →
member edges are drawn: each member's `serviceStatus.administratorAccountId` records the relationship.
