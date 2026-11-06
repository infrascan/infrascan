import { evaluateSelector } from "@infrascan/core";
import {
  DescribeManagedPrefixListsCommandInput,
  DescribeManagedPrefixListsCommandOutput,
  DescribeRouteTablesCommandInput,
  DescribeRouteTablesCommandOutput,
  DescribeSecurityGroupsCommandInput,
  DescribeSecurityGroupsCommandOutput,
  EC2Client,
  EC2ServiceException,
  GetManagedPrefixListEntriesCommand,
  GetManagedPrefixListEntriesCommandInput,
  GetManagedPrefixListEntriesCommandOutput,
  IpPermission,
} from "@aws-sdk/client-ec2";
import type {
  AwsContext,
  Connector,
  GenericState,
  Serialized,
  State,
} from "@infrascan/shared-types";
import debug from "debug";

type Selected<O, I> = Serialized<State<O, I>>;

function prefixListIdsOf(permissions?: Serialized<IpPermission>[]) {
  return (permissions ?? []).flatMap(
    (permission) =>
      permission.PrefixListIds?.map((prefixList) => prefixList.PrefixListId) ??
      [],
  );
}

/**
 * The prefix lists whose entries are fetched for one account and region: every customer managed list (`OwnerId` other
 * than `AWS`, which includes lists shared through RAM), plus every listed prefix list that a route table route
 * (`DestinationPrefixListId`) or a security group rule (ingress or egress `PrefixListIds`) references, so AWS managed
 * lists are only fetched when something scanned uses them.
 *
 * Referenced ids that DescribeManagedPrefixLists did not return are skipped: there would be no prefix list node to
 * record their entries on, and a list the account cannot describe cannot be read either.
 *
 * Sorted for a deterministic call order.
 */
export async function resolvePrefixListIdsToFetch(
  stateConnector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const [prefixListsState, routeTablesState, securityGroupsState] =
    await Promise.all([
      evaluateSelector<
        Selected<
          DescribeManagedPrefixListsCommandOutput,
          DescribeManagedPrefixListsCommandInput
        >
      >(
        context.account,
        context.region,
        "EC2|DescribeManagedPrefixLists|[]",
        stateConnector,
      ),
      evaluateSelector<
        Selected<
          DescribeRouteTablesCommandOutput,
          DescribeRouteTablesCommandInput
        >
      >(
        context.account,
        context.region,
        "EC2|DescribeRouteTables|[]",
        stateConnector,
      ),
      evaluateSelector<
        Selected<
          DescribeSecurityGroupsCommandOutput,
          DescribeSecurityGroupsCommandInput
        >
      >(
        context.account,
        context.region,
        "EC2|DescribeSecurityGroups|[]",
        stateConnector,
      ),
    ]);

  const prefixLists = (prefixListsState ?? []).flatMap(
    (page) => page._result?.PrefixLists ?? [],
  );
  const referenced = new Set<string | undefined>([
    ...(routeTablesState ?? []).flatMap((page) =>
      (page._result?.RouteTables ?? []).flatMap(
        (routeTable) =>
          routeTable.Routes?.map((route) => route.DestinationPrefixListId) ??
          [],
      ),
    ),
    ...(securityGroupsState ?? []).flatMap((page) =>
      (page._result?.SecurityGroups ?? []).flatMap((group) => [
        ...prefixListIdsOf(group.IpPermissions),
        ...prefixListIdsOf(group.IpPermissionsEgress),
      ]),
    ),
  ]);

  const toFetch = new Set<string>();
  for (const prefixList of prefixLists) {
    if (
      prefixList.PrefixListId != null &&
      (prefixList.OwnerId !== "AWS" || referenced.has(prefixList.PrefixListId))
    ) {
      toFetch.add(prefixList.PrefixListId);
    }
  }
  return [...toFetch].sort();
}

/**
 * Hand-written because the set of lists to fetch joins three functions' state (prefix lists, route tables and security
 * groups), which a codegen parameter selector cannot express: a selector reads one function's state and parameters are
 * zipped by index rather than concatenated. Must run after DescribeManagedPrefixLists, DescribeRouteTables and
 * DescribeSecurityGroups; the SDK runs a scanner's getters one after another in array order.
 *
 * State is recorded under `EC2|GetManagedPrefixListEntries`, one item per page with `_parameters.PrefixListId` set, as
 * the generated getter did. Each page gets its own parameter object, and a failure for one list does not stop the
 * others.
 */
export async function GetManagedPrefixListEntries(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:GetManagedPrefixListEntries");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const prefixListIds = await resolvePrefixListIdsToFetch(
    stateConnector,
    context,
  );

  for (const prefixListId of prefixListIds) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetManagedPrefixListEntriesCommandInput = {
        PrefixListId: prefixListId,
        NextToken: pagingToken,
      };
      try {
        const cmd = new GetManagedPrefixListEntriesCommand(preparedParams);
        const result: GetManagedPrefixListEntriesCommandOutput =
          await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.NextToken;
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        }
      } catch (err: unknown) {
        if (err instanceof EC2ServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "GetManagedPrefixListEntries",
    state,
  );
}
