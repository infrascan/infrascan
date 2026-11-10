import { mkdtempSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  DescribePermissionSetCommand,
  GetInlinePolicyForPermissionSetCommand,
  ListAccountsForProvisionedPermissionSetCommand,
  ListCustomerManagedPolicyReferencesInPermissionSetCommand,
  ListInstancesCommand,
  ListManagedPoliciesInPermissionSetCommand,
  ListPermissionSetsCommand,
  SSOAdminClient,
} from "@aws-sdk/client-sso-admin";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import IdentityCenterScanner from ".";
import type {
  GraphState,
  InstanceDetails,
  PermissionSetDetails,
  StatusState,
} from "./graph";

const MANAGEMENT = "111111111111";
const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "us-east-1";
const INSTANCE_ARN = "arn:aws:sso:::instance/ssoins-1111111111111111";
const ADMIN_PS = `arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-admin`;
const READ_PS = `arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-read`;

function newState(): { connector: Connector; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "infrascan-test-state-"));
  return { connector: buildFsConnector(dir), dir };
}

function contextFor(account: string, region = REGION): AwsContext {
  return { account, region };
}

const instance = {
  InstanceArn: INSTANCE_ARN,
  IdentityStoreId: "d-1234567890",
  OwnerAccountId: MANAGEMENT,
  Name: "org",
  Status: "ACTIVE" as const,
  CreatedDate: new Date("2023-01-01T00:00:00Z"),
  PrimaryRegion: REGION,
  Regions: [
    {
      RegionName: REGION,
      Status: "ACTIVE" as const,
      IsPrimaryRegion: true,
      AddedDate: new Date("2023-01-01T00:00:00Z"),
    },
    { RegionName: "eu-west-1", Status: "ACTIVE" as const },
  ],
};

function mockOrganizationInstance(client: SSOAdminClient) {
  const mocked = mockClient(client);
  mocked.on(ListInstancesCommand).resolves({ Instances: [instance] });
  mocked
    .on(ListPermissionSetsCommand)
    .resolvesOnce({ PermissionSets: [ADMIN_PS], NextToken: "page-2" })
    .resolves({ PermissionSets: [READ_PS] });
  mocked
    .on(DescribePermissionSetCommand, { PermissionSetArn: ADMIN_PS })
    .resolves({
      PermissionSet: {
        Name: "Admin",
        PermissionSetArn: ADMIN_PS,
        Description: "Administrator access",
        SessionDuration: "PT4H",
        RelayState: "https://console.aws.amazon.com/",
        CreatedDate: new Date("2023-02-01T00:00:00Z"),
      },
    })
    .on(DescribePermissionSetCommand, { PermissionSetArn: READ_PS })
    .rejects(new AccessDeniedException({ message: "denied", $metadata: {} }));
  mocked
    .on(ListManagedPoliciesInPermissionSetCommand)
    .resolves({ AttachedManagedPolicies: [] })
    .on(ListManagedPoliciesInPermissionSetCommand, {
      PermissionSetArn: ADMIN_PS,
    })
    .resolves({
      AttachedManagedPolicies: [
        {
          Name: "AdministratorAccess",
          Arn: "arn:aws:iam::aws:policy/AdministratorAccess",
        },
      ],
    });
  mocked
    .on(ListCustomerManagedPolicyReferencesInPermissionSetCommand)
    .resolves({ CustomerManagedPolicyReferences: [] })
    .on(ListCustomerManagedPolicyReferencesInPermissionSetCommand, {
      PermissionSetArn: ADMIN_PS,
    })
    .resolves({
      CustomerManagedPolicyReferences: [{ Name: "boundary", Path: "/org/" }],
    });
  mocked
    .on(ListAccountsForProvisionedPermissionSetCommand, {
      PermissionSetArn: ADMIN_PS,
    })
    .resolves({ AccountIds: [WORKLOAD, AUDIT] })
    .on(ListAccountsForProvisionedPermissionSetCommand, {
      PermissionSetArn: READ_PS,
    })
    .resolves({ AccountIds: [WORKLOAD] });
  mocked
    .on(GetInlinePolicyForPermissionSetCommand)
    .resolves({ InlinePolicy: '{"secret":"inline"}' });
  return mocked;
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: SSOAdminClient,
) {
  for (const getter of IdentityCenterScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of IdentityCenterScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes.push(node as BaseState as GraphState);
    }
  }
  return nodes;
}

const statusOf = (nodes: GraphState[]) =>
  nodes.find(
    (node) => node.$graph.nodeType === "identitycenter-status",
  ) as StatusState;

const permissionSetDetails = (node?: GraphState) =>
  (node as { identitycenter: { permissionSet: PermissionSetDetails } })
    .identitycenter.permissionSet;

t.test(
  "The management account reports the instance, permission sets and provisioned-to edges",
  async (t) => {
    const { connector, dir } = newState();
    const context = contextFor(MANAGEMENT);
    const client = IdentityCenterScanner.getClient(fromProcess(), context);
    const mocked = mockOrganizationInstance(client);
    await scan(connector, context, client);

    t.same(
      mocked
        .commandCalls(ListPermissionSetsCommand)
        .map((c) => c.args[0].input),
      [
        { InstanceArn: INSTANCE_ARN },
        { InstanceArn: INSTANCE_ARN, NextToken: "page-2" },
      ],
    );
    t.same(mocked.commandCalls(DescribePermissionSetCommand)[0].args[0].input, {
      InstanceArn: INSTANCE_ARN,
      PermissionSetArn: ADMIN_PS,
    });
    t.equal(
      mocked.commandCalls(GetInlinePolicyForPermissionSetCommand).length,
      0,
    );
    t.notOk(
      readdirSync(dir).some((file) => file.includes("InlinePolicy")),
      "inline policies are never fetched",
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 4);
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, MANAGEMENT);
      t.equal(node.tenant.tenantId, MANAGEMENT);
      t.equal(node.location?.code, REGION);
      t.equal(node.resource.category, "identitycenter");
    }
    t.notMatch(JSON.stringify(nodes), /secret/);

    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${MANAGEMENT}-${REGION}-identitycenter`);
    t.equal(status.resource.subcategory, "status");
    t.same(status.serviceStatus, {
      service: "identitycenter",
      status: "enabled",
      statusReason: undefined,
      failedCalls: { DescribePermissionSet: "AccessDeniedException" },
    });
    t.same(status.identitycenter.status.instances, [
      {
        arn: INSTANCE_ARN,
        name: "org",
        identityStoreId: "d-1234567890",
        ownerAccountId: MANAGEMENT,
        status: "ACTIVE",
        primaryRegion: REGION,
      },
    ]);

    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    const instanceNode = byId.get(INSTANCE_ARN);
    t.equal(instanceNode?.$graph.nodeType, "identitycenter-instance");
    t.equal(instanceNode?.audit?.createdAt, Date.parse("2023-01-01T00:00:00Z"));
    const instanceDetails = (
      instanceNode as { identitycenter: { instance: InstanceDetails } }
    ).identitycenter.instance;
    t.equal(instanceDetails.ownerAccountId, MANAGEMENT);
    t.equal(instanceDetails.regions.length, 2);

    const admin = byId.get(ADMIN_PS);
    t.equal(admin?.$graph.nodeType, "identitycenter-permission-set");
    t.equal(admin?.$graph.label, "Admin");
    t.same(permissionSetDetails(admin), {
      arn: ADMIN_PS,
      instanceArn: INSTANCE_ARN,
      name: "Admin",
      description: "Administrator access",
      sessionDuration: "PT4H",
      relayState: "https://console.aws.amazon.com/",
      createdAt: Date.parse("2023-02-01T00:00:00Z"),
      managedPolicies: [
        {
          name: "AdministratorAccess",
          arn: "arn:aws:iam::aws:policy/AdministratorAccess",
        },
      ],
      customerManagedPolicies: [{ name: "boundary", path: "/org/" }],
    });
    // A permission set that could not be described still has a node.
    const read = byId.get(READ_PS);
    t.equal(read?.$graph.label, READ_PS);
    t.equal(permissionSetDetails(read).instanceArn, INSTANCE_ARN);

    const edges = await IdentityCenterScanner.getEdges!(connector);
    t.same(edges, [
      {
        source: ADMIN_PS,
        target: WORKLOAD,
        metadata: { label: "provisioned-to" },
      },
      {
        source: ADMIN_PS,
        target: AUDIT,
        metadata: { label: "provisioned-to" },
      },
      {
        source: READ_PS,
        target: WORKLOAD,
        metadata: { label: "provisioned-to" },
      },
    ]);
  },
);

t.test("A region without an instance reports disabled", async (t) => {
  const { connector } = newState();
  const context = contextFor(WORKLOAD, "eu-west-1");
  const client = IdentityCenterScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(ListInstancesCommand).resolves({ Instances: [] });
  await scan(connector, context, client);

  t.equal(mocked.commandCalls(ListPermissionSetsCommand).length, 0);
  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.id, `${WORKLOAD}-eu-west-1-identitycenter`);
  t.equal(status.location?.code, "eu-west-1");
  t.equal(status.serviceStatus.status, "disabled");
  t.same(status.identitycenter.status.instances, []);
  t.same(await IdentityCenterScanner.getEdges!(connector), []);
});

t.test("A denied ListInstances gives an unknown status", async (t) => {
  const { connector } = newState();
  const context = contextFor(WORKLOAD);
  const client = IdentityCenterScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked
    .onAnyCommand()
    .rejects(new AccessDeniedException({ message: "denied", $metadata: {} }));
  await scan(connector, context, client);

  const state = await connector.resolveStateForServiceFunction(
    WORKLOAD,
    REGION,
    "SSOAdmin",
    "ListInstances",
  );
  t.same(state[0]._error, { name: "AccessDeniedException", message: "denied" });
  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.parent, WORKLOAD);
  t.equal(status.tenant.tenantId, WORKLOAD);
  t.same(status.serviceStatus, {
    service: "identitycenter",
    status: "unknown",
    statusReason: "AccessDeniedException",
    failedCalls: { ListInstances: "AccessDeniedException" },
  });
});

t.test(
  "An instance seen from several accounts and regions is reported once, by its owner in its primary region",
  async (t) => {
    const { connector } = newState();
    const scans: AwsContext[] = [
      contextFor(AUDIT),
      contextFor(MANAGEMENT, "eu-west-1"),
      contextFor(MANAGEMENT),
    ];
    for (const context of scans) {
      const client = new SSOAdminClient({
        region: context.region,
        credentials: fromProcess(),
      });
      mockOrganizationInstance(client);
      await scan(connector, context, client);
    }

    const audit = await nodesFor(connector, scans[0]);
    t.same(
      audit.map((node) => node.$graph.nodeType),
      ["identitycenter-status"],
    );
    t.equal(statusOf(audit).serviceStatus.status, "enabled");
    t.equal(
      statusOf(audit).identitycenter.status.instances[0].ownerAccountId,
      MANAGEMENT,
    );
    const secondary = await nodesFor(connector, scans[1]);
    t.same(
      secondary.map((node) => node.$graph.nodeType),
      ["identitycenter-status"],
    );
    const primary = await nodesFor(connector, scans[2]);
    t.same(
      primary.map((node) => node.$graph.id).sort(),
      [
        `${MANAGEMENT}-${REGION}-identitycenter`,
        ADMIN_PS,
        INSTANCE_ARN,
        READ_PS,
      ].sort(),
    );
    t.equal((await IdentityCenterScanner.getEdges!(connector)).length, 3);
  },
);
