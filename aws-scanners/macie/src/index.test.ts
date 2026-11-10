import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  DescribeOrganizationConfigurationCommand,
  GetAdministratorAccountCommand,
  GetAutomatedDiscoveryConfigurationCommand,
  GetClassificationExportConfigurationCommand,
  GetMacieSessionCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  Macie2Client,
  ThrottlingException,
} from "@aws-sdk/client-macie2";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import MacieScanner from ".";
import type { MacieStatusState } from "./graph";

const MANAGEMENT = "111111111111";
const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "ap-southeast-2";

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

const denied = () =>
  new AccessDeniedException({
    message: "User is not authorized to perform: macie2:ListMembers",
    $metadata: {},
  });
const notEnabled = () =>
  new AccessDeniedException({
    message: "Macie is not enabled.",
    $metadata: {},
  });

const enabledSession = {
  status: "ENABLED" as const,
  findingPublishingFrequency: "FIFTEEN_MINUTES" as const,
  serviceRole: "arn:aws:iam::222222222222:role/aws-service-role/macie",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-02-01T00:00:00Z"),
};

async function scan(
  connector: Connector,
  context: AwsContext,
  client: Macie2Client,
) {
  for (const getter of MacieScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: MacieStatusState[] = [];
  for (const entity of MacieScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes.push(node as BaseState as MacieStatusState);
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
  node: MacieStatusState | undefined,
  account: string,
) {
  t.ok(node, "status node emitted");
  t.equal(node?.$graph.id, `${account}-${REGION}-macie2`);
  t.equal(node?.$graph.nodeType, "macie2-status");
  t.equal(node?.$graph.nodeClass, "informational");
  t.equal(node?.$graph.parent, account);
  t.equal(node?.location?.code, REGION);
  t.equal(node?.tenant.tenantId, account);
  t.equal(node?.resource.category, "macie2");
  t.equal(node?.resource.subcategory, "status");
  t.equal(node?.serviceStatus.service, "macie2");
}

t.test(
  "Delegated administrator: organization configuration and members land on its status node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(AUDIT);
    const client = MacieScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(GetMacieSessionCommand).resolves(enabledSession);
    mocked.on(GetAdministratorAccountCommand).resolves({});
    mocked.on(ListOrganizationAdminAccountsCommand).rejects(denied());
    mocked
      .on(DescribeOrganizationConfigurationCommand)
      .resolves({ autoEnable: true, maxAccountLimitReached: false });
    mocked
      .on(ListMembersCommand, { nextToken: undefined })
      .resolves({
        members: [
          {
            accountId: WORKLOAD,
            administratorAccountId: AUDIT,
            arn: "arn:aws:macie2:ap-southeast-2:222222222222:member/333333333333",
            email: "workload@example.com",
            relationshipStatus: "Enabled",
            updatedAt: new Date("2024-03-01T00:00:00Z"),
          },
        ],
        nextToken: "page-2",
      })
      .on(ListMembersCommand, { nextToken: "page-2" })
      .resolves({
        members: [
          {
            accountId: MANAGEMENT,
            masterAccountId: AUDIT,
            relationshipStatus: "Removed",
          },
        ],
      });
    mocked.on(GetClassificationExportConfigurationCommand).resolves({
      configuration: {
        s3Destination: {
          bucketName: "discovery-results",
          keyPrefix: "macie/",
          kmsKeyArn: "arn:aws:kms:ap-southeast-2:222222222222:key/abc",
        },
      },
    });
    mocked
      .on(GetAutomatedDiscoveryConfigurationCommand)
      .resolves({ status: "ENABLED", autoEnableOrganizationMembers: "ALL" });
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(ListMembersCommand).length, 2);
    t.equal(
      mocked.commandCalls(ListMembersCommand)[0].args[0].input.onlyAssociated,
      "false",
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, AUDIT);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.statusReason, undefined);
    t.equal(node.serviceStatus.administratorAccountId, undefined);
    t.same(node.serviceStatus.failedCalls, {
      ListOrganizationAdminAccounts: "AccessDeniedException",
    });

    const details = node.macie2;
    t.equal(details.sessionStatus, "ENABLED");
    t.equal(details.findingPublishingFrequency, "FIFTEEN_MINUTES");
    t.equal(details.createdAt, Date.parse("2024-01-01T00:00:00Z"));
    t.same(details.organizationConfiguration, {
      autoEnable: true,
      maxAccountLimitReached: false,
    });
    t.same(details.members, [
      {
        accountId: WORKLOAD,
        relationshipStatus: "Enabled",
        administratorAccountId: AUDIT,
        invitedAt: null,
        updatedAt: Date.parse("2024-03-01T00:00:00Z"),
      },
      {
        accountId: MANAGEMENT,
        relationshipStatus: "Removed",
        administratorAccountId: AUDIT,
        invitedAt: null,
        updatedAt: null,
      },
    ]);
    t.notMatch(JSON.stringify(node), /example\.com/, "no member emails");
    t.same(details.classificationExportDestination, {
      bucketName: "discovery-results",
      keyPrefix: "macie/",
      kmsKeyArn: "arn:aws:kms:ap-southeast-2:222222222222:key/abc",
    });
    t.equal(details.automatedDiscoveryStatus, "ENABLED");
    t.equal(details.organizationAdminAccounts, undefined);
    t.equal(MacieScanner.getEdges, undefined);
  },
);

t.test(
  "Member account: enabled, administrator recorded, admin-only calls listed as failed",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = MacieScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(GetMacieSessionCommand).resolves(enabledSession);
    mocked.on(GetAdministratorAccountCommand).resolves({
      administrator: {
        accountId: AUDIT,
        relationshipStatus: "Enabled",
        invitedAt: new Date("2024-01-01T00:00:00Z"),
      },
    });
    mocked.on(GetClassificationExportConfigurationCommand).resolves({});
    mocked
      .on(GetAutomatedDiscoveryConfigurationCommand)
      .resolves({ status: "ENABLED" });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, WORKLOAD);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.administratorAccountId, AUDIT);
    t.equal(node.serviceStatus.relationshipStatus, "Enabled");
    t.same(node.serviceStatus.failedCalls, {
      ListOrganizationAdminAccounts: "AccessDeniedException",
      DescribeOrganizationConfiguration: "AccessDeniedException",
      ListMembers: "AccessDeniedException",
    });
    t.equal(node.macie2.organizationConfiguration, undefined);
    t.equal(node.macie2.members, undefined);
    t.equal(node.macie2.classificationExportDestination, undefined);
  },
);

t.test("Macie disabled → status disabled", async (t) => {
  t.test("not enabled", async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = MacieScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(notEnabled());
    // The management account can list delegated administrators without enabling Macie.
    mocked.on(ListOrganizationAdminAccountsCommand).resolves({
      adminAccounts: [{ accountId: AUDIT, status: "ENABLED" }],
    });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    assertStatusNode(t, nodes[0], MANAGEMENT);
    t.equal(nodes[0].serviceStatus.status, "disabled");
    t.equal(nodes[0].serviceStatus.statusReason, "Macie is not enabled.");
    t.equal(
      nodes[0].serviceStatus.failedCalls.GetMacieSession,
      "AccessDeniedException",
    );
    t.same(nodes[0].macie2.organizationAdminAccounts, [
      { accountId: AUDIT, status: "ENABLED" },
    ]);
  });

  t.test("paused", async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = MacieScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked
      .on(GetMacieSessionCommand)
      .resolves({ ...enabledSession, status: "PAUSED" });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes[0].serviceStatus.status, "disabled");
    t.equal(nodes[0].macie2.sessionStatus, "PAUSED");
  });
});

t.test(
  "Status call denied → status unknown with the error name, node still emitted",
  async (t) => {
    t.test("permission denied", async (t) => {
      const connector = newConnector();
      const context = contextFor(WORKLOAD);
      const client = MacieScanner.getClient(fromProcess(), context);
      const mocked = mockClient(client);
      mocked.onAnyCommand().rejects(denied());
      await scan(connector, context, client);

      const recorded = await connector.resolveStateForServiceFunction(
        WORKLOAD,
        REGION,
        "Macie2",
        "GetMacieSession",
      );
      t.equal(recorded[0]._error.name, "AccessDeniedException");

      const nodes = await nodesFor(connector, context);
      t.equal(nodes.length, 1);
      assertStatusNode(t, nodes[0], WORKLOAD);
      t.equal(nodes[0].serviceStatus.status, "unknown");
      t.equal(nodes[0].serviceStatus.statusReason, "AccessDeniedException");
      t.equal(Object.keys(nodes[0].serviceStatus.failedCalls).length, 7);
    });

    t.test("throttled", async (t) => {
      const connector = newConnector();
      const context = contextFor(WORKLOAD);
      const client = MacieScanner.getClient(fromProcess(), context);
      const mocked = mockClient(client);
      mocked.onAnyCommand().rejects(denied());
      mocked.on(GetMacieSessionCommand).rejects(
        new ThrottlingException({
          message: "Rate exceeded",
          $metadata: {},
        }),
      );
      await scan(connector, context, client);

      const nodes = await nodesFor(connector, context);
      t.equal(nodes[0].serviceStatus.status, "unknown");
      t.equal(nodes[0].serviceStatus.statusReason, "ThrottlingException");
    });
  },
);

t.test("No state recorded → no node", async (t) => {
  const connector = newConnector();
  t.same(await nodesFor(connector, contextFor(WORKLOAD)), []);
});
