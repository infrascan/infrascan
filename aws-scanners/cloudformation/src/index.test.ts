import { mkdtempSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  CloudFormationClient,
  DescribeOrganizationsAccessCommand,
  DescribeStackSetCommand,
  ListStackInstancesCommand,
  ListStackSetsCommand,
} from "@aws-sdk/client-cloudformation";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import CloudFormationScanner from ".";
import type { GraphState, StackSetDetails, StatusState } from "./graph";

const MANAGEMENT = "111111111111";
const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "us-east-1";
const BASELINE_ID = "baseline:11111111-aaaa-bbbb-cccc-000000000001";
const BASELINE_ARN = `arn:aws:cloudformation:${REGION}:${MANAGEMENT}:stackset/${BASELINE_ID}`;
const ROLES_ID = "roles:11111111-aaaa-bbbb-cccc-000000000002";
const ROLES_ARN = `arn:aws:cloudformation:${REGION}:${MANAGEMENT}:stackset/${ROLES_ID}`;
const PROD_OU = "ou-ab12-prod";
const SECURITY_OU = "ou-ab12-security";

function awsError(name: string): Error {
  const error = new Error(`${name} message`);
  error.name = name;
  return error;
}

function newState(): { connector: Connector; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "infrascan-test-state-"));
  return { connector: buildFsConnector(dir), dir };
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

const baseline = {
  StackSetName: "baseline",
  StackSetId: BASELINE_ID,
  StackSetARN: BASELINE_ARN,
  Description: "Org baseline",
  Status: "ACTIVE" as const,
  TemplateBody: "Resources: {SecretTemplate: {}}",
  Parameters: [{ ParameterKey: "Secret", ParameterValue: "hunter2" }],
  Capabilities: ["CAPABILITY_NAMED_IAM" as const],
  Tags: [{ Key: "owner", Value: "platform" }],
  PermissionModel: "SERVICE_MANAGED" as const,
  AutoDeployment: { Enabled: true, RetainStacksOnAccountRemoval: false },
  OrganizationalUnitIds: [PROD_OU, SECURITY_OU],
  Regions: [REGION, "eu-west-1"],
  ManagedExecution: { Active: true },
};

const roles = {
  StackSetName: "roles",
  StackSetId: ROLES_ID,
  StackSetARN: ROLES_ARN,
  Status: "ACTIVE" as const,
  TemplateBody: "Resources: {}",
  PermissionModel: "SELF_MANAGED" as const,
  AdministrationRoleARN: `arn:aws:iam::${MANAGEMENT}:role/AWSCloudFormationStackSetAdministrationRole`,
  ExecutionRoleName: "AWSCloudFormationStackSetExecutionRole",
};

const baselineInstances = [
  {
    StackSetId: BASELINE_ID,
    Account: WORKLOAD,
    Region: REGION,
    OrganizationalUnitId: PROD_OU,
    Status: "CURRENT" as const,
    StackInstanceStatus: { DetailedStatus: "SUCCEEDED" as const },
    DriftStatus: "NOT_CHECKED" as const,
  },
  {
    StackSetId: BASELINE_ID,
    Account: WORKLOAD,
    Region: "eu-west-1",
    OrganizationalUnitId: PROD_OU,
    Status: "OUTDATED" as const,
    StatusReason: "Stack is outdated",
    StackInstanceStatus: { DetailedStatus: "FAILED" as const },
    DriftStatus: "DRIFTED" as const,
    LastDriftCheckTimestamp: new Date("2024-03-01T00:00:00Z"),
  },
  {
    StackSetId: BASELINE_ID,
    Account: AUDIT,
    Region: REGION,
    OrganizationalUnitId: SECURITY_OU,
    Status: "CURRENT" as const,
  },
];

function summary(stackSet: typeof baseline | typeof roles) {
  return {
    StackSetName: stackSet.StackSetName,
    StackSetId: stackSet.StackSetId,
    Status: stackSet.Status,
    PermissionModel: stackSet.PermissionModel,
  };
}

function mockManagement(client: CloudFormationClient) {
  const mocked = mockClient(client);
  mocked.on(DescribeOrganizationsAccessCommand).resolves({ Status: "ENABLED" });
  mocked
    .on(ListStackSetsCommand, { CallAs: "SELF" })
    .resolvesOnce({ Summaries: [summary(baseline)], NextToken: "page-2" })
    .resolves({ Summaries: [summary(roles)] })
    .on(ListStackSetsCommand, { CallAs: "DELEGATED_ADMIN" })
    .rejects(awsError("ValidationError"));
  mocked.on(DescribeStackSetCommand).callsFake(({ StackSetName }) => ({
    StackSet: StackSetName === BASELINE_ID ? baseline : roles,
  }));
  mocked
    .on(ListStackInstancesCommand)
    .resolves({ Summaries: [] })
    .on(ListStackInstancesCommand, { StackSetName: BASELINE_ID })
    .resolves({ Summaries: baselineInstances })
    .on(ListStackInstancesCommand, { StackSetName: ROLES_ID })
    .resolves({
      Summaries: [
        {
          StackSetId: ROLES_ID,
          Account: AUDIT,
          Region: REGION,
          Status: "CURRENT" as const,
        },
      ],
    });
  return mocked;
}

/** A delegated administrator sees the management account's service-managed stack set. */
function mockDelegatedAdmin(client: CloudFormationClient) {
  const mocked = mockClient(client);
  mocked
    .on(DescribeOrganizationsAccessCommand)
    .rejects(awsError("ValidationError"));
  mocked
    .on(ListStackSetsCommand, { CallAs: "SELF" })
    .resolves({ Summaries: [] })
    .on(ListStackSetsCommand, { CallAs: "DELEGATED_ADMIN" })
    .resolves({ Summaries: [summary(baseline)] });
  mocked.on(DescribeStackSetCommand).resolves({ StackSet: baseline });
  mocked.on(ListStackInstancesCommand).resolves({
    Summaries: [
      {
        StackSetId: BASELINE_ID,
        Account: WORKLOAD,
        Region: "ap-southeast-2",
        OrganizationalUnitId: PROD_OU,
        Status: "CURRENT" as const,
      },
    ],
  });
  return mocked;
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: CloudFormationClient,
) {
  for (const getter of CloudFormationScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of CloudFormationScanner.entities ?? []) {
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

const stackSetDetails = (node?: GraphState) =>
  (node as { cloudformation: { stackSet: StackSetDetails } }).cloudformation
    .stackSet;

const statusOf = (nodes: GraphState[]) =>
  nodes.find(
    (node) => node.$graph.nodeType === "cloudformation-status",
  ) as StatusState;

t.test(
  "Management account scan produces stack sets, instances and deploys-to edges",
  async (t) => {
    const { connector, dir } = newState();
    const context = contextFor(MANAGEMENT);
    const client = CloudFormationScanner.getClient(fromProcess(), context);
    const mocked = mockManagement(client);
    await scan(connector, context, client);

    t.same(
      mocked
        .commandCalls(DescribeStackSetCommand)
        .map((c) => c.args[0].input)
        .sort((a, b) => a.StackSetName!.localeCompare(b.StackSetName!)),
      [
        { StackSetName: BASELINE_ID, CallAs: "SELF" },
        { StackSetName: ROLES_ID, CallAs: "SELF" },
      ],
    );
    t.same(
      mocked
        .commandCalls(ListStackSetsCommand)
        .map((c) => c.args[0].input.NextToken),
      [undefined, "page-2", undefined],
      "SELF is paginated, DELEGATED_ADMIN is called once",
    );

    // The DELEGATED_ADMIN failure is recorded next to the SELF pages.
    const listed = await connector.resolveStateForServiceFunction(
      MANAGEMENT,
      REGION,
      "CloudFormation",
      "ListStackSets",
    );
    t.equal(listed.length, 3);
    t.equal(listed[2]._parameters.CallAs, "DELEGATED_ADMIN");
    t.equal(listed[2]._error.name, "ValidationError");

    // Template bodies and parameter values never reach state.
    for (const file of readdirSync(dir)) {
      const content = readFileSync(join(dir, file), "utf8");
      t.notMatch(content, /SecretTemplate|hunter2|TemplateBody|Parameters/);
    }

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 3);
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, MANAGEMENT);
      t.equal(node.tenant.tenantId, MANAGEMENT);
      t.equal(node.location?.code, REGION);
      t.equal(node.resource.category, "cloudformation");
    }

    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${MANAGEMENT}-${REGION}-cloudformation`);
    t.equal(status.resource.subcategory, "status");
    t.same(status.serviceStatus, {
      service: "cloudformation",
      status: "enabled",
      statusReason: undefined,
      failedCalls: { ListStackSets: "ValidationError" },
    });
    t.equal(status.cloudformation.status.organizationsAccess, "ENABLED");
    t.same(status.cloudformation.status.undescribedStackSets, []);

    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    const baselineNode = byId.get(BASELINE_ARN);
    t.equal(baselineNode?.$graph.nodeType, "cloudformation-stack-set");
    t.same(baselineNode?.tags, [{ key: "owner", value: "platform" }]);
    const details = stackSetDetails(baselineNode);
    t.equal(details.callAs, "SELF");
    t.equal(details.permissionModel, "SERVICE_MANAGED");
    t.same(details.autoDeployment, {
      enabled: true,
      retainStacksOnAccountRemoval: false,
      dependsOn: undefined,
    });
    t.same(details.organizationalUnitIds, [PROD_OU, SECURITY_OU]);
    t.same(details.regions, [REGION, "eu-west-1"]);
    t.equal(details.managedExecutionActive, true);
    t.same(details.capabilities, ["CAPABILITY_NAMED_IAM"]);
    t.equal(details.stackInstances.length, 3);
    t.match(details.stackInstances[1], {
      account: WORKLOAD,
      region: "eu-west-1",
      organizationalUnitId: PROD_OU,
      status: "OUTDATED",
      detailedStatus: "FAILED",
      driftStatus: "DRIFTED",
      lastDriftCheckAt: Date.parse("2024-03-01T00:00:00Z"),
    });
    t.notOk("templateBody" in details);
    t.notOk("parameters" in details);
    t.equal(
      stackSetDetails(byId.get(ROLES_ARN)).executionRoleName,
      "AWSCloudFormationStackSetExecutionRole",
    );

    const edges = await CloudFormationScanner.getEdges!(connector);
    t.same(
      edges.sort((a, b) =>
        `${a.source}${a.target}`.localeCompare(`${b.source}${b.target}`),
      ),
      [
        {
          source: BASELINE_ARN,
          target: AUDIT,
          metadata: {
            label: "deploys-to",
            regions: [REGION],
            organizationalUnitIds: [SECURITY_OU],
          },
        },
        {
          source: BASELINE_ARN,
          target: WORKLOAD,
          metadata: {
            label: "deploys-to",
            regions: ["eu-west-1", REGION],
            organizationalUnitIds: [PROD_OU],
          },
        },
        {
          source: ROLES_ARN,
          target: AUDIT,
          metadata: {
            label: "deploys-to",
            regions: [REGION],
            organizationalUnitIds: [],
          },
        },
      ],
    );
  },
);

t.test("An account without stack sets still reports its status", async (t) => {
  const { connector } = newState();
  const context = contextFor(WORKLOAD);
  const client = CloudFormationScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked
    .on(DescribeOrganizationsAccessCommand)
    .resolves({ Status: "DISABLED" });
  mocked
    .on(ListStackSetsCommand, { CallAs: "SELF" })
    .resolves({ Summaries: [] })
    .on(ListStackSetsCommand, { CallAs: "DELEGATED_ADMIN" })
    .rejects(awsError("ValidationError"));
  await scan(connector, context, client);

  t.equal(mocked.commandCalls(DescribeStackSetCommand).length, 0);
  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.parent, WORKLOAD);
  t.equal(status.serviceStatus.status, "disabled");
  t.equal(status.cloudformation.status.organizationsAccess, "DISABLED");
  t.same(await CloudFormationScanner.getEdges!(connector), []);
});

t.test(
  "Denied calls are recorded and the status is unknown, not disabled",
  async (t) => {
    const { connector } = newState();
    const context = contextFor(WORKLOAD);
    const client = CloudFormationScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(awsError("AccessDenied"));
    await scan(connector, context, client);

    const access = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      REGION,
      "CloudFormation",
      "DescribeOrganizationsAccess",
    );
    t.same(access[0]._error, {
      name: "AccessDenied",
      message: "AccessDenied message",
    });
    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${WORKLOAD}-${REGION}-cloudformation`);
    t.equal(status.tenant.tenantId, WORKLOAD);
    t.equal(status.location?.code, REGION);
    t.same(status.serviceStatus, {
      service: "cloudformation",
      status: "unknown",
      statusReason: "AccessDenied",
      failedCalls: {
        DescribeOrganizationsAccess: "AccessDenied",
        ListStackSets: "AccessDenied",
      },
    });
  },
);

t.test(
  "A delegated administrator lists stack sets as DELEGATED_ADMIN; the owner reports the node",
  async (t) => {
    const { connector } = newState();
    const management = contextFor(MANAGEMENT);
    const audit = contextFor(AUDIT);
    const auditClient = CloudFormationScanner.getClient(fromProcess(), audit);
    const auditMock = mockDelegatedAdmin(auditClient);
    await scan(connector, audit, auditClient);

    t.same(auditMock.commandCalls(DescribeStackSetCommand)[0].args[0].input, {
      StackSetName: BASELINE_ID,
      CallAs: "DELEGATED_ADMIN",
    });
    t.same(auditMock.commandCalls(ListStackInstancesCommand)[0].args[0].input, {
      StackSetName: BASELINE_ID,
      CallAs: "DELEGATED_ADMIN",
    });

    // Only the delegated administrator was scanned: it reports the stack set, parented to the owning account.
    let auditNodes = await nodesFor(connector, audit);
    const viaDelegation = auditNodes.find(
      (node) => node.$graph.id === BASELINE_ARN,
    );
    t.equal(viaDelegation?.$graph.parent, MANAGEMENT);
    t.equal(viaDelegation?.tenant.tenantId, MANAGEMENT);
    t.equal(stackSetDetails(viaDelegation).callAs, "DELEGATED_ADMIN");
    t.equal(stackSetDetails(viaDelegation).listedFromAccountId, AUDIT);
    const auditStatus = statusOf(auditNodes);
    t.equal(auditStatus.$graph.parent, AUDIT);
    t.equal(auditStatus.serviceStatus.status, "unknown");
    t.equal(auditStatus.serviceStatus.statusReason, "ValidationError");

    // Once the owner is scanned too, it reports the node and the edges merge.
    const managementClient = new CloudFormationClient({
      region: REGION,
      credentials: fromProcess(),
    });
    mockManagement(managementClient);
    await scan(connector, management, managementClient);

    auditNodes = await nodesFor(connector, audit);
    t.equal(auditNodes.length, 1, "only the status node");
    const managementNodes = await nodesFor(connector, management);
    t.equal(
      stackSetDetails(
        managementNodes.find((node) => node.$graph.id === BASELINE_ARN),
      ).callAs,
      "SELF",
    );

    const edges = await CloudFormationScanner.getEdges!(connector);
    const workload = edges.filter(
      (edge) => edge.source === BASELINE_ARN && edge.target === WORKLOAD,
    );
    t.equal(workload.length, 1);
    t.same(workload[0].metadata, {
      label: "deploys-to",
      regions: ["ap-southeast-2", "eu-west-1", REGION],
      organizationalUnitIds: [PROD_OU],
    });
  },
);

t.test(
  "A stack set that cannot be described is listed on the status node",
  async (t) => {
    const { connector } = newState();
    const context = contextFor(MANAGEMENT);
    const client = CloudFormationScanner.getClient(fromProcess(), context);
    const mocked = mockManagement(client);
    mocked
      .on(DescribeStackSetCommand, { StackSetName: ROLES_ID })
      .rejects(awsError("StackSetNotFoundException"));
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.notOk(nodes.find((node) => node.$graph.id === ROLES_ARN));
    const status = statusOf(nodes);
    t.equal(
      status.serviceStatus.failedCalls.DescribeStackSet,
      "StackSetNotFoundException",
    );
    t.same(status.cloudformation.status.undescribedStackSets, [
      {
        stackSetId: ROLES_ID,
        stackSetName: "roles",
        callAs: "SELF",
        status: "ACTIVE",
        permissionModel: "SELF_MANAGED",
      },
    ]);
    const edges = await CloudFormationScanner.getEdges!(connector);
    t.notOk(edges.find((edge) => edge.source === ROLES_ARN));
  },
);
