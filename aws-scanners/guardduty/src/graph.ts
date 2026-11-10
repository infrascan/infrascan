import type {
  DescribeOrganizationConfigurationCommandInput,
  DescribeOrganizationConfigurationCommandOutput,
  DescribePublishingDestinationCommandInput,
  DescribePublishingDestinationCommandOutput,
  GetAdministratorAccountCommandInput,
  GetAdministratorAccountCommandOutput,
  GetDetectorCommandInput,
  GetDetectorCommandOutput,
  ListDetectorsCommandOutput,
  ListMembersCommandInput,
  ListMembersCommandOutput,
  ListOrganizationAdminAccountsCommandOutput,
  ListPublishingDestinationsCommandInput,
  ListPublishingDestinationsCommandOutput,
} from "@aws-sdk/client-guardduty";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

const SERVICE = "guardduty";

/**
 * Calls whose failure is reported on the status node, in getter order.
 */
export const GUARDDUTY_CALLS = [
  "ListDetectors",
  "GetDetector",
  "GetAdministratorAccount",
  "DescribeOrganizationConfiguration",
  "ListMembers",
  "ListPublishingDestinations",
  "DescribePublishingDestination",
  "ListOrganizationAdminAccounts",
] as const;

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

export interface GuardDutyFeature {
  name?: string;
  status?: string;
  updatedAt?: number | null;
  additionalConfiguration: {
    name?: string;
    status?: string;
    updatedAt?: number | null;
  }[];
}

export interface GuardDutyPublishingDestination {
  destinationId?: string;
  destinationType?: string;
  status?: string;
  destinationArn?: string;
  kmsKeyArn?: string;
}

export interface GuardDutyOrganizationConfiguration {
  autoEnableOrganizationMembers?: string;
  memberAccountLimitReached?: boolean;
  features: {
    name?: string;
    autoEnable?: string;
    additionalConfiguration: { name?: string; autoEnable?: string }[];
  }[];
}

export interface GuardDutyMember {
  accountId?: string;
  detectorId?: string;
  relationshipStatus?: string;
  administratorAccountId?: string;
  invitedAt?: number | null;
  updatedAt?: number | null;
}

export interface GuardDutyDetails {
  /** Every detector id GuardDuty listed. GuardDuty allows one per account per region. */
  detectorIds: string[];
  /** The detector the details below describe */
  detectorId?: string;
  /** The detector's own status, verbatim */
  detectorStatus?: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  findingPublishingFrequency?: string;
  serviceRole?: string;
  features: GuardDutyFeature[];
  publishingDestinations: GuardDutyPublishingDestination[];
  /** Only readable by the delegated administrator. Absent when the call failed or was not made. */
  organizationConfiguration?: GuardDutyOrganizationConfiguration;
  /** Members of this account as an administrator. Absent when the call failed or was not made. */
  members?: GuardDutyMember[];
  /** GuardDuty delegated administrators in this region. Only readable by the management account. */
  organizationAdminAccounts?: { accountId?: string; adminStatus?: string }[];
}

export type GuardDutyStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  guardduty: GuardDutyDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  guardduty: GuardDutyDetails;
}

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `GuardDuty|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

async function getFailedCalls(
  connector: Connector,
  context: AwsContext,
): Promise<Record<string, string>> {
  const failedCalls: Record<string, string> = {};
  for (const functionName of GUARDDUTY_CALLS) {
    const failed = (await getOwnState(connector, context, functionName)).find(
      (entry) => entry._error != null,
    );
    if (failed?._error != null) {
      failedCalls[functionName] = failed._error.name;
    }
  }
  return failedCalls;
}

function forDetector<O, I extends { DetectorId?: string }>(
  pages: Serialized<CallState<O, I>>[],
  detectorId: string | undefined,
): Serialized<CallState<O, I>>[] {
  return pages.filter((page) => page._parameters?.DetectorId === detectorId);
}

/**
 * A list of pages where every page succeeded, or undefined when any page failed or none was recorded, so a consumer
 * can tell "none" from "could not read".
 */
function successfulPages<O, I>(
  pages: Serialized<CallState<O, I>>[],
): Serialized<O>[] | undefined {
  if (pages.length === 0 || pages.some((page) => page._error != null)) {
    return undefined;
  }
  return pages.map((page) => page._result as Serialized<O>);
}

function getOrganizationConfiguration(
  pages: Serialized<DescribeOrganizationConfigurationCommandOutput>[],
): GuardDutyOrganizationConfiguration {
  return {
    autoEnableOrganizationMembers: pages.find(
      (page) => page.AutoEnableOrganizationMembers != null,
    )?.AutoEnableOrganizationMembers,
    memberAccountLimitReached: pages.find(
      (page) => page.MemberAccountLimitReached != null,
    )?.MemberAccountLimitReached,
    features: pages.flatMap((page) =>
      (page.Features ?? []).map((feature) => ({
        name: feature.Name,
        autoEnable: feature.AutoEnable,
        additionalConfiguration: (feature.AdditionalConfiguration ?? []).map(
          (config) => ({ name: config.Name, autoEnable: config.AutoEnable }),
        ),
      })),
    ),
  };
}

async function getPublishingDestinations(
  connector: Connector,
  context: AwsContext,
  detectorId: string | undefined,
): Promise<GuardDutyPublishingDestination[]> {
  const described = new Map<
    string,
    Serialized<DescribePublishingDestinationCommandOutput>
  >();
  for (const page of forDetector(
    await getOwnState<
      DescribePublishingDestinationCommandOutput,
      DescribePublishingDestinationCommandInput
    >(connector, context, "DescribePublishingDestination"),
    detectorId,
  )) {
    const destinationId = page._parameters?.DestinationId;
    if (destinationId != null && page._result != null) {
      described.set(destinationId, page._result);
    }
  }
  const listed = forDetector(
    await getOwnState<
      ListPublishingDestinationsCommandOutput,
      ListPublishingDestinationsCommandInput
    >(connector, context, "ListPublishingDestinations"),
    detectorId,
  );
  return listed.flatMap((page) =>
    (page._result?.Destinations ?? []).map((destination) => {
      const detail = described.get(destination.DestinationId ?? "");
      return {
        destinationId: destination.DestinationId,
        destinationType: detail?.DestinationType ?? destination.DestinationType,
        status: detail?.Status ?? destination.Status,
        destinationArn: detail?.DestinationProperties?.DestinationArn,
        kmsKeyArn: detail?.DestinationProperties?.KmsKeyArn,
      };
    }),
  );
}

export const GuardDutyStatusEntity: TranslatedEntity<
  GuardDutyStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "guardduty-status",
  provider: "aws",
  command: "ListDetectors",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "GuardDuty|ListDetectors|[]",

  async getState(connector, context) {
    const listPages = await getOwnState<ListDetectorsCommandOutput>(
      connector,
      context,
      "ListDetectors",
    );
    if (listPages.length === 0) {
      return [];
    }
    const listError = listPages.find((page) => page._error != null)?._error;
    const detectorIds = [
      ...new Set(listPages.flatMap((page) => page._result?.DetectorIds ?? [])),
    ];

    const detectors = await getOwnState<
      GetDetectorCommandOutput,
      GetDetectorCommandInput
    >(connector, context, "GetDetector");
    // Prefer an enabled detector if, unusually, more than one is listed.
    const detectorId =
      detectorIds.find(
        (id) => forDetector(detectors, id)[0]?._result?.Status === "ENABLED",
      ) ?? detectorIds[0];
    const detectorPage = forDetector(detectors, detectorId)[0];
    const detector = detectorPage?._result;

    // Status mapping:
    // - ListDetectors failed (denied, throttled, ...): unknown, reason is the error name.
    // - No detector: disabled. GuardDuty is enabled by creating a detector.
    // - GetDetector failed: unknown, reason is the error name.
    // - Otherwise the detector's own Status: ENABLED -> enabled, DISABLED (which is how a suspended detector is
    //   reported) -> disabled.
    let status: ServiceStatus["status"];
    let statusReason: string | undefined;
    if (listError != null) {
      status = "unknown";
      statusReason = listError.name;
    } else if (detectorId == null) {
      status = "disabled";
    } else if (detectorPage?._error != null || detector == null) {
      status = "unknown";
      statusReason = detectorPage?._error?.name ?? "GetDetectorNotRecorded";
    } else {
      status = detector.Status === "ENABLED" ? "enabled" : "disabled";
    }

    const administrator = forDetector(
      await getOwnState<
        GetAdministratorAccountCommandOutput,
        GetAdministratorAccountCommandInput
      >(connector, context, "GetAdministratorAccount"),
      detectorId,
    )[0]?._result?.Administrator;

    const organizationConfiguration = successfulPages(
      forDetector(
        await getOwnState<
          DescribeOrganizationConfigurationCommandOutput,
          DescribeOrganizationConfigurationCommandInput
        >(connector, context, "DescribeOrganizationConfiguration"),
        detectorId,
      ),
    );
    const members = successfulPages(
      forDetector(
        await getOwnState<ListMembersCommandOutput, ListMembersCommandInput>(
          connector,
          context,
          "ListMembers",
        ),
        detectorId,
      ),
    );
    const adminAccounts = successfulPages(
      await getOwnState<ListOrganizationAdminAccountsCommandOutput>(
        connector,
        context,
        "ListOrganizationAdminAccounts",
      ),
    );

    return [
      {
        $metadata: listPages[0]._metadata,
        serviceStatus: {
          service: SERVICE,
          status,
          statusReason,
          administratorAccountId: administrator?.AccountId,
          relationshipStatus: administrator?.RelationshipStatus,
          failedCalls: await getFailedCalls(connector, context),
        },
        guardduty: {
          detectorIds,
          detectorId,
          detectorStatus: detector?.Status,
          createdAt: tryNormalizeDateEpoch(detector?.CreatedAt),
          updatedAt: tryNormalizeDateEpoch(detector?.UpdatedAt),
          findingPublishingFrequency: detector?.FindingPublishingFrequency,
          serviceRole: detector?.ServiceRole,
          features: (detector?.Features ?? []).map((feature) => ({
            name: feature.Name,
            status: feature.Status,
            updatedAt: tryNormalizeDateEpoch(feature.UpdatedAt),
            additionalConfiguration: (
              feature.AdditionalConfiguration ?? []
            ).map((config) => ({
              name: config.Name,
              status: config.Status,
              updatedAt: tryNormalizeDateEpoch(config.UpdatedAt),
            })),
          })),
          publishingDestinations: await getPublishingDestinations(
            connector,
            context,
            detectorId,
          ),
          organizationConfiguration:
            organizationConfiguration != null
              ? getOrganizationConfiguration(organizationConfiguration)
              : undefined,
          members: members?.flatMap((page) =>
            (page.Members ?? []).map((member) => ({
              accountId: member.AccountId,
              detectorId: member.DetectorId,
              relationshipStatus: member.RelationshipStatus,
              administratorAccountId: member.AdministratorId ?? member.MasterId,
              invitedAt: tryNormalizeDateEpoch(member.InvitedAt),
              updatedAt: tryNormalizeDateEpoch(member.UpdatedAt),
            })),
          ),
          organizationAdminAccounts: adminAccounts?.flatMap((page) =>
            (page.AdminAccounts ?? []).map((account) => ({
              accountId: account.AdminAccountId,
              adminStatus: account.AdminStatus,
            })),
          ),
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata(val) {
      return {
        version: GuardDutyStatusEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $source() {
      return { command: GuardDutyStatusEntity.command };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `GuardDuty (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: GuardDutyStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: GuardDutyStatusEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        name: `GuardDuty (${val.$metadata.region})`,
        category: GuardDutyStatusEntity.category,
        subcategory: GuardDutyStatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    guardduty(val) {
      return val.guardduty;
    },
  },
};

export type GraphState = GuardDutyStatusState;
