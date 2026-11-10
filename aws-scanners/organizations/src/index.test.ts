import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  DescribePolicyCommand,
  DescribeResourcePolicyCommand,
  ListAccountsForParentCommand,
  ListAWSServiceAccessForOrganizationCommand,
  ListDelegatedAdministratorsCommand,
  ListDelegatedServicesForAccountCommand,
  ListOrganizationalUnitsForParentCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  ListTagsForResourceCommand,
  ListTargetsForPolicyCommand,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import OrganizationsScanner from ".";
import type { GraphState } from "./graph";

const MANAGEMENT = "111111111111";
const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const ORG_ID = "o-abc123";
const ORG_ARN = `arn:aws:organizations::${MANAGEMENT}:organization/${ORG_ID}`;
const ROOT_ID = "r-ab12";
const ROOT_ARN = `arn:aws:organizations::${MANAGEMENT}:root/${ORG_ID}/${ROOT_ID}`;
const SECURITY_OU = "ou-ab12-security";
const WORKLOADS_OU = "ou-ab12-workloads";
const PROD_OU = "ou-ab12-prod";
const ouArn = (id: string) =>
  `arn:aws:organizations::${MANAGEMENT}:ou/${ORG_ID}/${id}`;
const accountArn = (id: string) =>
  `arn:aws:organizations::${MANAGEMENT}:account/${ORG_ID}/${id}`;
const FULL_ACCESS_ARN =
  "arn:aws:organizations::aws:policy/service_control_policy/p-FullAWSAccess";
const DENY_LEAVE_ARN = `arn:aws:organizations::${MANAGEMENT}:policy/${ORG_ID}/service_control_policy/p-denyleave`;

const organization = {
  Id: ORG_ID,
  Arn: ORG_ARN,
  FeatureSet: "ALL" as const,
  MasterAccountId: MANAGEMENT,
  MasterAccountArn: accountArn(MANAGEMENT),
  MasterAccountEmail: "management@example.com",
};

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: "us-east-1" };
}

function mockManagement(client: OrganizationsClient) {
  const mocked = mockClient(client);
  mocked
    .on(DescribeOrganizationCommand)
    .resolves({ Organization: organization });
  mocked.on(ListRootsCommand).resolves({
    Roots: [
      {
        Id: ROOT_ID,
        Arn: ROOT_ARN,
        Name: "Root",
        PolicyTypes: [
          { Type: "SERVICE_CONTROL_POLICY", Status: "ENABLED" },
          { Type: "TAG_POLICY", Status: "PENDING_ENABLE" },
        ],
      },
    ],
  });
  const ou = (id: string, name: string) => ({
    Id: id,
    Arn: ouArn(id),
    Name: name,
  });
  mocked
    .on(ListOrganizationalUnitsForParentCommand)
    .resolves({ OrganizationalUnits: [] })
    .on(ListOrganizationalUnitsForParentCommand, { ParentId: ROOT_ID })
    .resolves({
      OrganizationalUnits: [
        ou(SECURITY_OU, "Security"),
        ou(WORKLOADS_OU, "Workloads"),
      ],
    })
    .on(ListOrganizationalUnitsForParentCommand, { ParentId: WORKLOADS_OU })
    .resolves({ OrganizationalUnits: [ou(PROD_OU, "Prod")] });
  const account = (id: string, name: string) => ({
    Id: id,
    Arn: accountArn(id),
    Name: name,
    Email: `${name.toLowerCase()}@example.com`,
    State: "ACTIVE" as const,
    JoinedMethod: "CREATED" as const,
    JoinedTimestamp: new Date("2024-01-01T00:00:00Z"),
  });
  mocked
    .on(ListAccountsForParentCommand)
    .resolves({ Accounts: [] })
    .on(ListAccountsForParentCommand, { ParentId: ROOT_ID })
    .resolves({ Accounts: [account(MANAGEMENT, "Management")] })
    .on(ListAccountsForParentCommand, { ParentId: SECURITY_OU })
    .resolves({ Accounts: [account(AUDIT, "Audit")] })
    .on(ListAccountsForParentCommand, { ParentId: PROD_OU })
    .resolves({ Accounts: [account(WORKLOAD, "Workload")] });
  const fullAccess = {
    Id: "p-FullAWSAccess",
    Arn: FULL_ACCESS_ARN,
    Name: "FullAWSAccess",
    Type: "SERVICE_CONTROL_POLICY" as const,
    AwsManaged: true,
  };
  const denyLeave = {
    Id: "p-denyleave",
    Arn: DENY_LEAVE_ARN,
    Name: "DenyLeave",
    Type: "SERVICE_CONTROL_POLICY" as const,
    AwsManaged: false,
  };
  mocked
    .on(ListPoliciesCommand)
    .resolves({ Policies: [fullAccess, denyLeave] });
  mocked.on(DescribePolicyCommand).callsFake(({ PolicyId }) => ({
    Policy: {
      PolicySummary: PolicyId === "p-denyleave" ? denyLeave : fullAccess,
      Content: `{"policy":"${PolicyId}"}`,
    },
  }));
  mocked
    .on(ListTargetsForPolicyCommand, { PolicyId: "p-FullAWSAccess" })
    .resolves({
      Targets: [
        { TargetId: ROOT_ID, Arn: ROOT_ARN, Name: "Root", Type: "ROOT" },
      ],
    })
    .on(ListTargetsForPolicyCommand, { PolicyId: "p-denyleave" })
    .resolves({
      Targets: [
        {
          TargetId: PROD_OU,
          Arn: ouArn(PROD_OU),
          Name: "Prod",
          Type: "ORGANIZATIONAL_UNIT",
        },
        {
          TargetId: WORKLOAD,
          Arn: accountArn(WORKLOAD),
          Name: "Workload",
          Type: "ACCOUNT",
        },
      ],
    });
  mocked.on(ListDelegatedAdministratorsCommand).resolves({
    DelegatedAdministrators: [
      { Id: AUDIT, Arn: accountArn(AUDIT), Name: "Audit" },
    ],
  });
  mocked.on(ListDelegatedServicesForAccountCommand).resolves({
    DelegatedServices: [
      {
        ServicePrincipal: "guardduty.amazonaws.com",
        DelegationEnabledDate: new Date("2024-02-01T00:00:00Z"),
      },
      {
        ServicePrincipal: "config.amazonaws.com",
        DelegationEnabledDate: new Date("2024-02-02T00:00:00Z"),
      },
    ],
  });
  mocked.on(ListAWSServiceAccessForOrganizationCommand).resolves({
    EnabledServicePrincipals: [
      {
        ServicePrincipal: "guardduty.amazonaws.com",
        DateEnabled: new Date("2024-02-01T00:00:00Z"),
      },
    ],
  });
  mocked.on(DescribeResourcePolicyCommand).resolves({
    ResourcePolicy: { Content: '{"Version":"2012-10-17"}' },
  });
  mocked
    .on(ListTagsForResourceCommand)
    .resolves({ Tags: [] })
    .on(ListTagsForResourceCommand, { ResourceId: WORKLOAD })
    .resolves({ Tags: [{ Key: "environment", Value: "prod" }] });
  return mocked;
}

function mockMember(client: OrganizationsClient) {
  const mocked = mockClient(client);
  const denied = new AccessDeniedException({
    message: "denied",
    $metadata: {},
  });
  mocked.onAnyCommand().rejects(denied);
  mocked
    .on(DescribeOrganizationCommand)
    .resolves({ Organization: organization });
  return mocked;
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: OrganizationsClient,
) {
  for (const getter of OrganizationsScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of OrganizationsScanner.entities ?? []) {
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

t.test(
  "Management account scan produces the organization tree, policies and edges",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = OrganizationsScanner.getClient(fromProcess(), context);
    const mocked = mockManagement(client);
    await scan(connector, context, client);

    // The OU walk lists the root and every OU once.
    const listedParents = mocked
      .commandCalls(ListOrganizationalUnitsForParentCommand)
      .map((c) => c.args[0].input.ParentId)
      .sort();
    t.same(listedParents, [PROD_OU, ROOT_ID, SECURITY_OU, WORKLOADS_OU].sort());
    t.equal(mocked.commandCalls(ListAccountsForParentCommand).length, 4);
    // Only enabled policy types are listed.
    t.same(
      mocked
        .commandCalls(ListPoliciesCommand)
        .map((c) => c.args[0].input.Filter),
      ["SERVICE_CONTROL_POLICY"],
    );

    const nodes = await nodesFor(connector, context);
    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.resource.category, "organizations");
      t.ok(node.$metadata.version);
    }

    const org = byId.get(ORG_ARN);
    t.ok(org, "organization node");
    t.equal(org?.tenant.tenantId, MANAGEMENT);
    t.equal(org?.$graph.parent, undefined);
    t.equal(org?.resource.policy, '{"Version":"2012-10-17"}');
    const orgDetails = (
      org as { organizations: { organization: Record<string, unknown> } }
    ).organizations.organization;
    t.equal(orgDetails.observedFrom, "management");
    t.equal(orgDetails.featureSet, "ALL");
    t.same(orgDetails.failedCalls, {});
    t.same(orgDetails.trustedAccess, [
      {
        servicePrincipal: "guardduty.amazonaws.com",
        enabledAt: Date.parse("2024-02-01T00:00:00Z"),
      },
    ]);

    t.equal(byId.get(ROOT_ARN)?.$graph.parent, ORG_ARN);
    t.equal(byId.get(ouArn(SECURITY_OU))?.$graph.parent, ROOT_ARN);
    t.equal(byId.get(ouArn(WORKLOADS_OU))?.$graph.parent, ROOT_ARN);
    t.equal(byId.get(ouArn(PROD_OU))?.$graph.parent, ouArn(WORKLOADS_OU));

    const workload = byId.get(WORKLOAD);
    t.equal(workload?.$graph.parent, ouArn(PROD_OU));
    t.equal(workload?.tenant.tenantId, WORKLOAD);
    t.same(workload?.tags, [{ key: "environment", value: "prod" }]);
    t.equal(byId.get(MANAGEMENT)?.$graph.parent, ROOT_ARN);
    const accountDetails = (node?: GraphState) =>
      (node as { organizations: { account: Record<string, unknown> } })
        .organizations.account;
    t.equal(accountDetails(byId.get(MANAGEMENT)).isManagementAccount, true);
    t.equal(accountDetails(workload).isManagementAccount, false);
    t.equal(
      accountDetails(workload).joinedAt,
      Date.parse("2024-01-01T00:00:00Z"),
    );
    t.same(
      (
        accountDetails(byId.get(AUDIT)).delegatedAdministratorFor as {
          servicePrincipal: string;
        }[]
      ).map(({ servicePrincipal }) => servicePrincipal),
      ["guardduty.amazonaws.com", "config.amazonaws.com"],
    );

    const fullAccess = byId.get(FULL_ACCESS_ARN);
    t.equal(fullAccess?.tenant.tenantId, "aws");
    t.equal(fullAccess?.$graph.parent, undefined);
    const denyLeave = byId.get(DENY_LEAVE_ARN);
    t.equal(denyLeave?.$graph.parent, ORG_ARN);
    t.equal(
      (denyLeave as { organizations: { policy: { content: string } } })
        .organizations.policy.content,
      '{"policy":"p-denyleave"}',
    );

    const edges = await OrganizationsScanner.getEdges!(connector);
    const edge = (source: string, target: string) =>
      edges.find((e) => e.source === source && e.target === target);
    t.equal(edge(FULL_ACCESS_ARN, ROOT_ARN)?.metadata?.label, "attached");
    t.equal(
      edge(DENY_LEAVE_ARN, ouArn(PROD_OU))?.metadata?.targetType,
      "ORGANIZATIONAL_UNIT",
    );
    t.ok(edge(DENY_LEAVE_ARN, WORKLOAD), "account targets use the account id");
    const delegated = edge(ORG_ARN, AUDIT);
    t.equal(delegated?.metadata?.label, "delegated-administrator");
    t.same(delegated?.metadata?.services, [
      {
        servicePrincipal: "config.amazonaws.com",
        delegationEnabledAt: Date.parse("2024-02-02T00:00:00Z"),
      },
      {
        servicePrincipal: "guardduty.amazonaws.com",
        delegationEnabledAt: Date.parse("2024-02-01T00:00:00Z"),
      },
    ]);
    t.equal(edges.length, 4);
  },
);

t.test(
  "A member account records the denied calls and only reports the organization",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = OrganizationsScanner.getClient(fromProcess(), context);
    const mocked = mockMember(client);
    await scan(connector, context, client);

    // Nothing to walk once ListRoots is denied.
    t.equal(
      mocked.commandCalls(ListOrganizationalUnitsForParentCommand).length,
      0,
    );
    t.equal(mocked.commandCalls(ListAccountsForParentCommand).length, 0);

    const roots = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      "us-east-1",
      "Organizations",
      "ListRoots",
    );
    t.equal(roots[0]._error.name, "AccessDeniedException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const details = (
      nodes[0] as { organizations: { organization: Record<string, unknown> } }
    ).organizations.organization;
    t.equal(details.observedFrom, "member");
    t.equal(
      (details.failedCalls as Record<string, string>).ListRoots,
      "AccessDeniedException",
    );
    t.same(await OrganizationsScanner.getEdges!(connector), []);
  },
);

t.test(
  "Scans of several accounts in one organization report each node once",
  async (t) => {
    const connector = newConnector();
    const management = contextFor(MANAGEMENT);
    const member = contextFor(WORKLOAD);
    const managementClient = OrganizationsScanner.getClient(
      fromProcess(),
      management,
    );
    mockManagement(managementClient);
    const memberClient = new OrganizationsClient({
      region: "us-east-1",
      credentials: fromProcess(),
    });
    mockMember(memberClient);
    // The member is scanned first; the management account still reports the organization.
    await scan(connector, member, memberClient);
    await scan(connector, management, managementClient);

    t.same(await nodesFor(connector, member), []);
    const managementNodes = await nodesFor(connector, management);
    const org = managementNodes.find((node) => node.$graph.id === ORG_ARN);
    t.equal(
      (org as { organizations: { organization: { observedFrom: string } } })
        .organizations.organization.observedFrom,
      "management",
    );
    t.equal(
      new Set(managementNodes.map((node) => node.$graph.id)).size,
      managementNodes.length,
    );
  },
);

t.test(
  "An account outside any organization records the error and reports nothing",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = OrganizationsScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(
      new AWSOrganizationsNotInUseException({
        message: "not in use",
        $metadata: {},
      }),
    );
    await scan(connector, context, client);

    const state = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      "us-east-1",
      "Organizations",
      "DescribeOrganization",
    );
    t.equal(state[0]._error.name, "AWSOrganizationsNotInUseException");
    t.same(await nodesFor(connector, context), []);
  },
);
