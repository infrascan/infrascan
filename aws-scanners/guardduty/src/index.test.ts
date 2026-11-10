import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  BadRequestException,
  DescribeOrganizationConfigurationCommand,
  DescribePublishingDestinationCommand,
  GetAdministratorAccountCommand,
  GetDetectorCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  ListPublishingDestinationsCommand,
} from "@aws-sdk/client-guardduty";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import GuardDutyScanner from ".";
import type { GuardDutyStatusState } from "./graph";

const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "us-east-1";
const DETECTOR = "12abc34d567e8fa901bc2d34e56789f0";

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

const denied = () =>
  new AccessDeniedException({ message: "denied", $metadata: {} });
const badRequest = () =>
  new BadRequestException({
    message:
      "The request is rejected because the current account is not the delegated administrator.",
    $metadata: {},
  });

const enabledDetector = {
  Status: "ENABLED" as const,
  ServiceRole: "arn:aws:iam::222222222222:role/aws-service-role/guardduty",
  FindingPublishingFrequency: "SIX_HOURS" as const,
  CreatedAt: "2024-01-01T00:00:00.000Z",
  UpdatedAt: "2024-02-01T00:00:00.000Z",
  Features: [
    {
      Name: "S3_DATA_EVENTS" as const,
      Status: "ENABLED" as const,
      UpdatedAt: new Date("2024-02-01T00:00:00Z"),
    },
    {
      Name: "RUNTIME_MONITORING" as const,
      Status: "ENABLED" as const,
      UpdatedAt: new Date("2024-02-01T00:00:00Z"),
      AdditionalConfiguration: [
        {
          Name: "EKS_ADDON_MANAGEMENT" as const,
          Status: "DISABLED" as const,
          UpdatedAt: new Date("2024-02-01T00:00:00Z"),
        },
      ],
    },
  ],
};

async function scan(
  connector: Connector,
  context: AwsContext,
  client: GuardDutyClient,
) {
  for (const getter of GuardDutyScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GuardDutyStatusState[] = [];
  for (const entity of GuardDutyScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes.push(node as BaseState as GuardDutyStatusState);
    }
  }
  return nodes;
}

interface Asserts {
  ok(value: unknown, message?: string): boolean;
  equal(found: unknown, wanted: unknown, message?: string): boolean;
}

function assertStatusNode(
  t: Asserts,
  node: GuardDutyStatusState | undefined,
  account: string,
) {
  t.ok(node, "status node emitted");
  t.equal(node?.$graph.id, `${account}-${REGION}-guardduty`);
  t.equal(node?.$graph.nodeType, "guardduty-status");
  t.equal(node?.$graph.nodeClass, "informational");
  t.equal(node?.$graph.parent, account);
  t.equal(node?.location?.code, REGION);
  t.equal(node?.tenant.tenantId, account);
  t.equal(node?.resource.category, "guardduty");
  t.equal(node?.resource.subcategory, "status");
  t.equal(node?.serviceStatus.service, "guardduty");
}

t.test(
  "Delegated administrator: organization configuration and members land on its status node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(AUDIT);
    const client = GuardDutyScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListDetectorsCommand).resolves({ DetectorIds: [DETECTOR] });
    mocked.on(GetDetectorCommand).resolves(enabledDetector);
    mocked.on(GetAdministratorAccountCommand).resolves({});
    mocked
      .on(DescribeOrganizationConfigurationCommand, { NextToken: undefined })
      .resolves({
        AutoEnableOrganizationMembers: "ALL",
        MemberAccountLimitReached: false,
        Features: [
          {
            Name: "S3_DATA_EVENTS",
            AutoEnable: "NEW",
          },
        ],
        NextToken: "page-2",
      })
      .on(DescribeOrganizationConfigurationCommand, { NextToken: "page-2" })
      .resolves({
        MemberAccountLimitReached: false,
        Features: [
          {
            Name: "RUNTIME_MONITORING",
            AutoEnable: "ALL",
            AdditionalConfiguration: [
              { Name: "EKS_ADDON_MANAGEMENT", AutoEnable: "NONE" },
            ],
          },
        ],
      });
    mocked.on(ListMembersCommand).resolves({
      Members: [
        {
          AccountId: WORKLOAD,
          DetectorId: "member-detector",
          MasterId: AUDIT,
          AdministratorId: AUDIT,
          Email: "workload@example.com",
          RelationshipStatus: "Enabled",
          UpdatedAt: "2024-03-01T00:00:00.000Z",
        },
      ],
    });
    mocked.on(ListPublishingDestinationsCommand).resolves({
      Destinations: [
        {
          DestinationId: "dest-1",
          DestinationType: "S3",
          Status: "PUBLISHING",
        },
      ],
    });
    mocked.on(DescribePublishingDestinationCommand).resolves({
      DestinationId: "dest-1",
      DestinationType: "S3",
      Status: "PUBLISHING",
      PublishingFailureStartTimestamp: 0,
      DestinationProperties: {
        DestinationArn: "arn:aws:s3:::findings-bucket",
        KmsKeyArn: "arn:aws:kms:us-east-1:222222222222:key/abc",
      },
    });
    mocked.on(ListOrganizationAdminAccountsCommand).rejects(badRequest());
    await scan(connector, context, client);

    t.same(mocked.commandCalls(ListMembersCommand)[0].args[0].input, {
      DetectorId: DETECTOR,
      OnlyAssociated: "false",
    });
    t.equal(
      mocked.commandCalls(DescribeOrganizationConfigurationCommand).length,
      2,
      "organization configuration is paginated",
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, AUDIT);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.statusReason, undefined);
    t.equal(node.serviceStatus.administratorAccountId, undefined);
    t.same(node.serviceStatus.failedCalls, {
      ListOrganizationAdminAccounts: "BadRequestException",
    });

    const details = node.guardduty;
    t.equal(details.detectorId, DETECTOR);
    t.equal(details.detectorStatus, "ENABLED");
    t.equal(details.createdAt, Date.parse("2024-01-01T00:00:00Z"));
    t.equal(details.findingPublishingFrequency, "SIX_HOURS");
    t.same(details.features[1], {
      name: "RUNTIME_MONITORING",
      status: "ENABLED",
      updatedAt: Date.parse("2024-02-01T00:00:00Z"),
      additionalConfiguration: [
        {
          name: "EKS_ADDON_MANAGEMENT",
          status: "DISABLED",
          updatedAt: Date.parse("2024-02-01T00:00:00Z"),
        },
      ],
    });
    t.same(details.organizationConfiguration, {
      autoEnableOrganizationMembers: "ALL",
      memberAccountLimitReached: false,
      features: [
        {
          name: "S3_DATA_EVENTS",
          autoEnable: "NEW",
          additionalConfiguration: [],
        },
        {
          name: "RUNTIME_MONITORING",
          autoEnable: "ALL",
          additionalConfiguration: [
            { name: "EKS_ADDON_MANAGEMENT", autoEnable: "NONE" },
          ],
        },
      ],
    });
    t.same(details.members, [
      {
        accountId: WORKLOAD,
        detectorId: "member-detector",
        relationshipStatus: "Enabled",
        administratorAccountId: AUDIT,
        invitedAt: null,
        updatedAt: Date.parse("2024-03-01T00:00:00Z"),
      },
    ]);
    t.notMatch(JSON.stringify(node), /example\.com/, "no member emails");
    t.same(details.publishingDestinations, [
      {
        destinationId: "dest-1",
        destinationType: "S3",
        status: "PUBLISHING",
        destinationArn: "arn:aws:s3:::findings-bucket",
        kmsKeyArn: "arn:aws:kms:us-east-1:222222222222:key/abc",
      },
    ]);
    t.equal(details.organizationAdminAccounts, undefined);
    t.same(GuardDutyScanner.getEdges, undefined);
  },
);

t.test(
  "Member account: enabled, administrator recorded, admin-only calls listed as failed",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = GuardDutyScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(ListDetectorsCommand).resolves({ DetectorIds: [DETECTOR] });
    mocked.on(GetDetectorCommand).resolves(enabledDetector);
    mocked.on(GetAdministratorAccountCommand).resolves({
      Administrator: {
        AccountId: AUDIT,
        InvitationId: "inv",
        RelationshipStatus: "Enabled",
        InvitedAt: "2024-01-01T00:00:00.000Z",
      },
    });
    mocked.on(DescribeOrganizationConfigurationCommand).rejects(badRequest());
    mocked.on(ListPublishingDestinationsCommand).resolves({ Destinations: [] });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, WORKLOAD);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.administratorAccountId, AUDIT);
    t.equal(node.serviceStatus.relationshipStatus, "Enabled");
    t.same(node.serviceStatus.failedCalls, {
      DescribeOrganizationConfiguration: "BadRequestException",
      ListMembers: "AccessDeniedException",
      ListOrganizationAdminAccounts: "AccessDeniedException",
    });
    t.equal(node.guardduty.organizationConfiguration, undefined);
    t.equal(node.guardduty.members, undefined);
    t.same(node.guardduty.publishingDestinations, []);
    t.equal(
      mocked.commandCalls(DescribePublishingDestinationCommand).length,
      0,
    );
  },
);

t.test("GuardDuty disabled → status disabled", async (t) => {
  t.test("no detector", async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = GuardDutyScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListDetectorsCommand).resolves({ DetectorIds: [] });
    mocked.on(ListOrganizationAdminAccountsCommand).rejects(denied());
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(GetDetectorCommand).length, 0);
    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    assertStatusNode(t, nodes[0], WORKLOAD);
    t.equal(nodes[0].serviceStatus.status, "disabled");
    t.equal(nodes[0].serviceStatus.statusReason, undefined);
    t.same(nodes[0].guardduty.detectorIds, []);
  });

  t.test("detector disabled", async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = GuardDutyScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(ListDetectorsCommand).resolves({ DetectorIds: [DETECTOR] });
    mocked
      .on(GetDetectorCommand)
      .resolves({ ...enabledDetector, Status: "DISABLED" });
    mocked.on(GetAdministratorAccountCommand).resolves({});
    mocked.on(ListPublishingDestinationsCommand).resolves({ Destinations: [] });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes[0].serviceStatus.status, "disabled");
    t.equal(nodes[0].guardduty.detectorStatus, "DISABLED");
  });
});

t.test(
  "Status call denied → status unknown with the error name, node still emitted",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = GuardDutyScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    await scan(connector, context, client);

    const state = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      REGION,
      "GuardDuty",
      "ListDetectors",
    );
    t.equal(state[0]._error.name, "AccessDeniedException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    assertStatusNode(t, nodes[0], WORKLOAD);
    t.equal(nodes[0].serviceStatus.status, "unknown");
    t.equal(nodes[0].serviceStatus.statusReason, "AccessDeniedException");
    t.same(nodes[0].serviceStatus.failedCalls, {
      ListDetectors: "AccessDeniedException",
      ListOrganizationAdminAccounts: "AccessDeniedException",
    });
  },
);

t.test("No state recorded → no node", async (t) => {
  const connector = newConnector();
  t.same(await nodesFor(connector, contextFor(WORKLOAD)), []);
});
