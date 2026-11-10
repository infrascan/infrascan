import type {
  GetAlternateContactCommandInput,
  ListRegionsCommandOutput,
} from "@aws-sdk/client-account";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import {
  ALTERNATE_CONTACT_TYPES,
  type RecordedAlternateContact,
} from "./getters";
import type { CallState } from "./state";

/**
 * Header shared by the status node of every organisation governance scanner.
 */
export interface ServiceStatus {
  service: string;
  status: "enabled" | "disabled" | "unknown";
  /** Error name when status is unknown, or AWS's own reason when it gives one */
  statusReason?: string;
  /** The account this account's administrator relationship points at, as reported by the service */
  administratorAccountId?: string;
  /** The service's own relationship status string, verbatim */
  relationshipStatus?: string;
  /** Calls that failed for this account and region, keyed by call name, valued by error name */
  failedCalls: Record<string, string>;
}

/**
 * The error AWS returns from `GetAlternateContact` when no contact of the requested type is set. It answers the
 * question, so it is neither a failed call nor an unknown.
 */
const NOT_SET_ERROR = "ResourceNotFoundException";

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `Account|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

/**
 * Whether an alternate contact is set. No contact details are recorded.
 */
export type AlternateContactState = "set" | "not-set" | "unknown";

export interface AccountManagementDetails {
  /** Every Region of the account and its opt-in status, verbatim. Absent when `ListRegions` failed. */
  regions?: { name?: string; optStatus?: string }[];
  alternateContacts: {
    security: AlternateContactState;
    billing: AlternateContactState;
    operations: AlternateContactState;
  };
}

export type AccountStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  account: AccountManagementDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  account: AccountManagementDetails;
}

/**
 * Status mapping for Account Management. "Status" is whether the account's own settings could be read; there is no
 * disabled state.
 * - `enabled`: `ListRegions` succeeded, or at least one `GetAlternateContact` call answered (a contact, or
 *   `ResourceNotFoundException`, which means the contact is not set).
 * - `unknown`: every call failed (denied, throttled, etc.). `statusReason` is the error name of `ListRegions`, or of
 *   the first failed `GetAlternateContact` when `ListRegions` was not recorded.
 *
 * Alternate contacts: a result is `set`, `ResourceNotFoundException` is `not-set`, any other error (or no call) is
 * `unknown` and is listed in `failedCalls`.
 */
export const AccountStatusEntity: TranslatedEntity<
  AccountStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "account-status",
  provider: "aws",
  command: "ListRegions",
  category: "account",
  subcategory: "status",
  nodeType: "account-status",
  selector: "Account|ListRegions|[]",

  async getState(connector, context) {
    const regionPages = await getOwnState<ListRegionsCommandOutput>(
      connector,
      context,
      "ListRegions",
    );
    const contactPages = await getOwnState<
      RecordedAlternateContact,
      GetAlternateContactCommandInput
    >(connector, context, "GetAlternateContact");
    if (regionPages.length === 0 && contactPages.length === 0) {
      return [];
    }

    const failedCalls: Record<string, string> = {};
    const regionError = regionPages.find((page) => page._error != null)?._error;
    if (regionError != null) {
      failedCalls.ListRegions = regionError.name;
    }
    const contactError = contactPages.find(
      (page) => page._error != null && page._error.name !== NOT_SET_ERROR,
    )?._error;
    if (contactError != null) {
      failedCalls.GetAlternateContact = contactError.name;
    }

    const contactState = (contactType: string): AlternateContactState => {
      const page = contactPages.find(
        (entry) => entry._parameters?.AlternateContactType === contactType,
      );
      if (page?._result != null) {
        return page._result.isSet ? "set" : "not-set";
      }
      if (page?._error?.name === NOT_SET_ERROR) {
        return "not-set";
      }
      return "unknown";
    };
    const [security, billing, operations] =
      ALTERNATE_CONTACT_TYPES.map(contactState);

    const regionsRead = regionPages.length > 0 && regionError == null;
    const contactsRead = [security, billing, operations].some(
      (state) => state !== "unknown",
    );
    let status: Pick<ServiceStatus, "status" | "statusReason">;
    if (regionsRead || contactsRead) {
      status = { status: "enabled" };
    } else {
      status = {
        status: "unknown",
        statusReason: regionError?.name ?? contactError?.name,
      };
    }

    return [
      {
        $metadata: (regionPages[0] ?? contactPages[0])._metadata,
        serviceStatus: { service: "account", ...status, failedCalls },
        account: {
          regions: regionsRead
            ? regionPages.flatMap((page) =>
                (page._result?.Regions ?? []).map((region) => ({
                  name: region.RegionName,
                  optStatus: region.RegionOptStatus,
                })),
              )
            : undefined,
          alternateContacts: { security, billing, operations },
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata(val) {
      return { version: "0.1.0", timestamp: val.$metadata.timestamp };
    },
    $source() {
      return { command: "ListRegions" };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-account`,
        label: "Account Management",
        nodeClass: "informational",
        nodeType: AccountStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: AccountStatusEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    resource(val) {
      return {
        id: `${val.$metadata.account}-account`,
        name: "Account Management",
        category: AccountStatusEntity.category,
        subcategory: AccountStatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    account(val) {
      return val.account;
    },
  },
};

export type GraphState = AccountStatusState;
