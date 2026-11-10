# @infrascan/aws-cloudformation-scanner

A scanner module for AWS CloudFormation StackSets. It records how stack sets deploy across an organization: whether
StackSets has trusted access to Organizations, each stack set's permission model, auto-deployment, target OUs and
regions, and the accounts and regions it has stack instances in. All nodes are informational.

Individual stacks, templates and parameter values are out of scope. This module is standalone: it is not registered
by [@infrascan/aws](../../packages/aws).

## What is scanned

StackSets are regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `DescribeOrganizationsAccess` (`CallAs: SELF`) | Status node: whether StackSets has trusted access to Organizations. |
| `ListStackSets` (`CallAs: SELF` and `CallAs: DELEGATED_ADMIN`, `Status: ACTIVE`) | The stack sets the account owns, and those it can manage as a delegated administrator. |
| `DescribeStackSet` (matching `CallAs`) | Stack set nodes: permission model, auto-deployment, OU ids, regions, managed execution, roles, capabilities. `TemplateBody` and `Parameters` are dropped before the response is recorded. |
| `ListStackInstances` (matching `CallAs`) | Stack instances on each stack set node, and `deploys-to` edges. |

Stack set operations and drift detection are not called; drift status is recorded as AWS last reported it.

Which account sees what:

- The **management account** lists its stack sets with `SELF`, including service-managed ones, and can describe
  Organizations access. Its `DELEGATED_ADMIN` call fails (recorded).
- A **delegated administrator** lists the organization's service-managed stack sets with `DELEGATED_ADMIN`, and its
  own self-managed ones with `SELF`. `DescribeOrganizationsAccess` with `SELF` usually fails there.
- Any **other account** lists its own self-managed stack sets with `SELF`; the `DELEGATED_ADMIN` call and usually
  `DescribeOrganizationsAccess` fail.

A call that fails is recorded with its error (see `CallState`), so a denied call is not mistaken for an empty result.
Failed calls are listed on the status node in `serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`cloudformation-status`) | `${account}-${region}-cloudformation` | scanned account id |
| Stack set (`cloudformation-stack-set`) | stack set ARN | owning account id (from the ARN: the management account for a stack set listed as `DELEGATED_ADMIN`) |

The status node carries `serviceStatus` and `cloudformation.status`:

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `DescribeOrganizationsAccess` returned `ENABLED` |
| `disabled` | `DescribeOrganizationsAccess` returned `DISABLED` or `DISABLED_PERMANENTLY` |
| `unknown` | `DescribeOrganizationsAccess` failed; `statusReason` is the error name |

`cloudformation.status.organizationsAccess` is the status string verbatim, and `undescribedStackSets` lists stack sets
that were listed but could not be described (they have no node, as their ARN is unknown).

Stack set nodes carry `cloudformation.stackSet`, including the `callAs` they were read with, the account they were
listed from, and every stack instance (account, region, OU id, status, detailed status, drift status).

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `deploys-to` | stack set → account id | `regions` and `organizationalUnitIds` of the stack instances in that account |

When a stack set is seen by its owner and by delegated administrators, its node is emitted once: by the owner's scan
if it was scanned, otherwise by the lowest delegated administrator account id. Edges from all scans are merged.
