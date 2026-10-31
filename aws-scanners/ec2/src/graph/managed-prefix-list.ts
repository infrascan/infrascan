import {
  DescribeManagedPrefixListsCommandInput,
  DescribeManagedPrefixListsCommandOutput,
  GetManagedPrefixListEntriesCommandInput,
  GetManagedPrefixListEntriesCommandOutput,
  ManagedPrefixList,
  PrefixListEntry,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface ManagedPrefixListDetails {
  arn?: string;
  name?: string;
  /**
   * `AWS` for AWS managed lists such as `com.amazonaws.<region>.s3`
   */
  ownerId?: string;
  addressFamily?: string;
  maxEntries?: number;
  state?: string;
  version?: number;
  /**
   * Only fetched for customer managed lists, undefined for AWS managed lists
   */
  entries?: { cidr?: string; description?: string }[];
}

export interface ManagedPrefixListState
  extends BaseState<DescribeManagedPrefixListsCommandInput> {
  prefixList?: ManagedPrefixListDetails;
}

type PrefixListEntriesState = Serialized<
  State<
    GetManagedPrefixListEntriesCommandOutput,
    GetManagedPrefixListEntriesCommandInput
  >
>;

/**
 * DescribeManagedPrefixLists state joined with the GetManagedPrefixListEntries results for the same account and
 * region
 */
export type ManagedPrefixListRawState = State<
  DescribeManagedPrefixListsCommandOutput,
  DescribeManagedPrefixListsCommandInput
> & {
  $entries?: PrefixListEntriesState[];
};

type ManagedPrefixListWithEntries = ManagedPrefixList & {
  $entries?: PrefixListEntry[];
};

export const ManagedPrefixListEntity: TranslatedEntity<
  ManagedPrefixListState,
  ManagedPrefixListRawState,
  WithCallContext<
    ManagedPrefixListWithEntries,
    DescribeManagedPrefixListsCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-managed-prefix-list",
  provider: "aws",
  command: "DescribeManagedPrefixLists",
  category: "ec2",
  subcategory: "managed-prefix-list",
  nodeType: "ec2-managed-prefix-list",
  selector: "EC2|DescribeManagedPrefixLists|[]",

  async getState(state, context) {
    const [prefixListsState, entriesState] = await Promise.all([
      evaluateSelector<Serialized<ManagedPrefixListRawState>>(
        context.account,
        context.region,
        ManagedPrefixListEntity.selector,
        state,
      ),
      evaluateSelector<PrefixListEntriesState>(
        context.account,
        context.region,
        "EC2|GetManagedPrefixListEntries|[]",
        state,
      ),
    ]);
    return (prefixListsState ?? []).map((prefixListState) => ({
      ...prefixListState,
      $entries: entriesState ?? [],
    }));
  },

  translate(val) {
    return (
      val._result.PrefixLists?.map((prefixList) => {
        // Entries for one list can span several pages, each recorded as its own state item
        const pages = (val.$entries ?? []).filter(
          (page) => page._parameters?.PrefixListId === prefixList.PrefixListId,
        );
        return {
          $metadata: val._metadata,
          $parameters: val._parameters,
          ...prefixList,
          $entries:
            pages.length > 0
              ? pages.flatMap((page) => page._result?.Entries ?? [])
              : undefined,
        };
      }) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: ManagedPrefixListEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.PrefixListId!,
        label: val.PrefixListName ?? val.PrefixListId!,
        nodeClass: "informational",
        nodeType: ManagedPrefixListEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: ManagedPrefixListEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.PrefixListId!,
        name: val.PrefixListName ?? val.PrefixListId!,
        category: ManagedPrefixListEntity.category,
        subcategory: ManagedPrefixListEntity.subcategory,
      };
    },

    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: ManagedPrefixListEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    prefixList(val) {
      return {
        arn: val.PrefixListArn,
        name: val.PrefixListName,
        ownerId: val.OwnerId,
        addressFamily: val.AddressFamily,
        maxEntries: val.MaxEntries,
        state: val.State,
        version: val.Version,
        entries: val.$entries?.map((entry) => ({
          cidr: entry.Cidr,
          description: entry.Description,
        })),
      };
    },
  },
};
