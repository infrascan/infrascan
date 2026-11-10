# @infrascan/aws-account-scanner

A scanner module for AWS Account Management. It records the scanned account's own settings: which Regions are enabled
and whether each alternate contact is set. Contact details are personal data and are never recorded, neither in the
node nor in the scan state. All nodes are informational.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Account Management is global (`callPerRegion: false`). Only the calling account is read: no `AccountId` is passed, so
no cross-account calls are made.

| Call | Used for |
| --- | --- |
| `ListRegions` | Every Region and its opt-in status (`ENABLED`, `ENABLED_BY_DEFAULT`, `DISABLED`, ...), verbatim. |
| `GetAlternateContact` | For `SECURITY`, `BILLING` and `OPERATIONS`: whether the contact is set. Only `isSet` and the contact type are recorded. |

`GetContactInformation` and `GetPrimaryEmail` are not called.

A call that fails is recorded with its error (see `CallState`). `ResourceNotFoundException` from `GetAlternateContact`
means the contact is not set and is not treated as a failure; any other error makes that contact `unknown` and is
listed in `serviceStatus.failedCalls`.

## Status

"Status" is whether the account's own settings could be read; there is no disabled state.

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `ListRegions` succeeded, or at least one alternate contact could be read (set or not set). |
| `unknown` | Every call failed. `statusReason` is the error name. |

| `account.alternateContacts.<type>` | When |
| --- | --- |
| `set` | AWS returned a contact. |
| `not-set` | AWS returned `ResourceNotFoundException`. |
| `unknown` | Any other error. |

## Graph

| Node | Id | Parent | Detail |
| --- | --- | --- | --- |
| Account status (`account-status`) | `${account}-account` | scanned account id | `serviceStatus`, `account` (`regions`, `alternateContacts`) |

One status node is emitted per scanned account, with no location. No edges are emitted.
