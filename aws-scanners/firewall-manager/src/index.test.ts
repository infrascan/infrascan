import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  FMSClient,
  GetAdminAccountCommand,
  GetAdminScopeCommand,
  GetPolicyCommand,
  InvalidOperationException,
  ListAdminAccountsForOrganizationCommand,
  ListAdminsManagingAccountCommand,
  ListPoliciesCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-fms";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import FirewallManagerScanner from ".";
import type { GraphState, PolicyDetails, StatusState } from "./graph";

const MANAGEMENT = "111111111111";
const SECURITY = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "us-east-1";
const PROD_OU = "ou-ab12-prod";
const policyArn = (id: string) =>
  `arn:aws:fms:${REGION}:${SECURITY}:policy/${id}`;
const WAF_ARN = policyArn("waf-policy");
const SG_ARN = policyArn("sg-policy");

function awsError(name: string): Error {
  const error = new Error(`${name} message`);
  error.name = name;
  return error;
}

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: FMSClient,
) {
  for (const getter of FirewallManagerScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of FirewallManagerScanner.entities ?? []) {
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
  nodes.find((node) => node.$graph.nodeType === "fms-status") as StatusState;

const policyDetails = (node?: GraphState) =>
  (node as { fms: { policy: PolicyDetails } }).fms.policy;

t.test(
  "The administrator account reports its policies and include/exclude edges",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(SECURITY);
    const client = FirewallManagerScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(GetAdminAccountCommand)
      .resolves({ AdminAccount: SECURITY, RoleStatus: "READY" });
    mocked.on(ListAdminAccountsForOrganizationCommand).rejects(
      new InvalidOperationException({
        message: "management account only",
        $metadata: {},
      }),
    );
    mocked
      .on(ListAdminsManagingAccountCommand)
      .resolves({ AdminAccounts: [SECURITY] });
    mocked
      .on(ListPoliciesCommand)
      .resolvesOnce({
        PolicyList: [
          {
            PolicyArn: WAF_ARN,
            PolicyId: "waf-policy",
            PolicyName: "waf",
            SecurityServiceType: "WAFV2",
          },
        ],
        NextToken: "page-2",
      })
      .resolves({
        PolicyList: [
          {
            PolicyArn: SG_ARN,
            PolicyId: "sg-policy",
            PolicyName: "sg",
            SecurityServiceType: "SECURITY_GROUPS_COMMON",
            ResourceType: "AWS::EC2::Instance",
            RemediationEnabled: false,
          },
        ],
      });
    mocked
      .on(GetPolicyCommand, { PolicyId: "waf-policy" })
      .resolves({
        PolicyArn: WAF_ARN,
        Policy: {
          PolicyId: "waf-policy",
          PolicyName: "waf",
          PolicyDescription: "Baseline WAF",
          PolicyStatus: "ACTIVE",
          SecurityServicePolicyData: {
            Type: "WAFV2",
            ManagedServiceData: '{"type":"WAFV2","rules":"secret-rules"}',
          },
          ResourceType: "ResourceTypeList",
          ResourceTypeList: [
            "AWS::ElasticLoadBalancingV2::LoadBalancer",
            "AWS::ApiGateway::Stage",
          ],
          ResourceTags: [{ Key: "env", Value: "prod" }],
          ExcludeResourceTags: false,
          ResourceTagLogicalOperator: "AND",
          RemediationEnabled: true,
          DeleteUnusedFMManagedResources: true,
          IncludeMap: { ACCOUNT: [WORKLOAD, MANAGEMENT], ORG_UNIT: [PROD_OU] },
        },
      })
      .on(GetPolicyCommand, { PolicyId: "sg-policy" })
      .rejects(awsError("AccessDeniedException"));
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(GetAdminScopeCommand).length, 0);
    t.same(
      mocked
        .commandCalls(GetPolicyCommand)
        .map((c) => c.args[0].input.PolicyId),
      ["waf-policy", "sg-policy"],
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 3);
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, SECURITY);
      t.equal(node.tenant.tenantId, SECURITY);
      t.equal(node.location?.code, REGION);
      t.equal(node.resource.category, "fms");
    }

    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${SECURITY}-${REGION}-fms`);
    t.same(status.serviceStatus, {
      service: "fms",
      status: "enabled",
      statusReason: undefined,
      administratorAccountId: SECURITY,
      relationshipStatus: "READY",
      failedCalls: {
        ListAdminAccountsForOrganization: "InvalidOperationException",
        GetPolicy: "AccessDeniedException",
      },
    });
    t.same(status.fms.status.adminsManagingAccount, [SECURITY]);
    t.same(status.fms.status.organizationAdmins, []);

    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    const waf = byId.get(WAF_ARN);
    t.equal(waf?.$graph.nodeType, "fms-policy");
    t.equal(waf?.resource.description, "Baseline WAF");
    t.same(policyDetails(waf), {
      arn: WAF_ARN,
      id: "waf-policy",
      name: "waf",
      description: "Baseline WAF",
      status: "ACTIVE",
      securityServiceType: "WAFV2",
      resourceType: "ResourceTypeList",
      resourceTypeList: [
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        "AWS::ApiGateway::Stage",
      ],
      remediationEnabled: true,
      deleteUnusedFMManagedResources: true,
      includeMap: {
        accounts: [WORKLOAD, MANAGEMENT],
        organizationalUnits: [PROD_OU],
      },
      excludeMap: undefined,
      resourceTags: [{ key: "env", value: "prod" }],
      excludeResourceTags: false,
      resourceTagLogicalOperator: "AND",
    });
    t.notMatch(JSON.stringify(waf), /secret-rules/);

    // The policy that could not be read keeps what ListPolicies reported.
    t.match(policyDetails(byId.get(SG_ARN)), {
      securityServiceType: "SECURITY_GROUPS_COMMON",
      resourceType: "AWS::EC2::Instance",
      remediationEnabled: false,
      includeMap: undefined,
    });

    const edges = await FirewallManagerScanner.getEdges!(connector);
    t.same(edges, [
      { source: WAF_ARN, target: WORKLOAD, metadata: { label: "includes" } },
      { source: WAF_ARN, target: MANAGEMENT, metadata: { label: "includes" } },
    ]);
  },
);

t.test(
  "The management account reports administrators and their scope",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = FirewallManagerScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(GetAdminAccountCommand)
      .resolves({ AdminAccount: SECURITY, RoleStatus: "READY" });
    mocked.on(ListAdminAccountsForOrganizationCommand).resolves({
      AdminAccounts: [
        {
          AdminAccount: SECURITY,
          DefaultAdmin: true,
          Status: "ONBOARDING_COMPLETE",
        },
        { AdminAccount: WORKLOAD, DefaultAdmin: false, Status: "ONBOARDING" },
      ],
    });
    mocked.on(ListAdminsManagingAccountCommand).resolves({ AdminAccounts: [] });
    mocked
      .on(GetAdminScopeCommand, { AdminAccount: SECURITY })
      .resolves({
        Status: "ONBOARDING_COMPLETE",
        AdminScope: {
          AccountScope: { AllAccountsEnabled: true },
          OrganizationalUnitScope: {
            OrganizationalUnits: [PROD_OU],
            ExcludeSpecifiedOrganizationalUnits: true,
          },
          RegionScope: { AllRegionsEnabled: true },
          PolicyTypeScope: { PolicyTypes: ["WAFV2"] },
        },
      })
      .on(GetAdminScopeCommand, { AdminAccount: WORKLOAD })
      .rejects(awsError("AccessDeniedException"));
    mocked
      .on(ListPoliciesCommand)
      .rejects(
        new InvalidOperationException({ message: "not admin", $metadata: {} }),
      );
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(GetPolicyCommand).length, 0);
    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusOf(nodes);
    t.equal(status.$graph.parent, MANAGEMENT);
    t.equal(status.serviceStatus.status, "enabled");
    t.equal(status.serviceStatus.administratorAccountId, SECURITY);
    t.same(status.serviceStatus.failedCalls, {
      GetAdminScope: "AccessDeniedException",
      ListPolicies: "InvalidOperationException",
    });
    t.same(status.fms.status.organizationAdmins, [
      {
        adminAccount: SECURITY,
        defaultAdmin: true,
        status: "ONBOARDING_COMPLETE",
        scope: {
          status: "ONBOARDING_COMPLETE",
          accounts: {
            accounts: [],
            allAccountsEnabled: true,
            excludeSpecifiedAccounts: undefined,
          },
          organizationalUnits: {
            organizationalUnits: [PROD_OU],
            allOrganizationalUnitsEnabled: undefined,
            excludeSpecifiedOrganizationalUnits: true,
          },
          regions: { regions: [], allRegionsEnabled: true },
          policyTypes: {
            policyTypes: ["WAFV2"],
            allPolicyTypesEnabled: undefined,
          },
        },
      },
      {
        adminAccount: WORKLOAD,
        defaultAdmin: false,
        status: "ONBOARDING",
        scope: undefined,
      },
    ]);
    t.same(await FirewallManagerScanner.getEdges!(connector), []);
  },
);

t.test(
  "No administrator (ResourceNotFoundException) reports disabled",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = FirewallManagerScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .onAnyCommand()
      .rejects(
        new ResourceNotFoundException({ message: "not found", $metadata: {} }),
      );
    mocked.on(ListAdminsManagingAccountCommand).resolves({ AdminAccounts: [] });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${WORKLOAD}-${REGION}-fms`);
    t.equal(status.serviceStatus.status, "disabled");
    t.equal(status.serviceStatus.statusReason, "ResourceNotFoundException");
    t.equal(status.serviceStatus.administratorAccountId, undefined);
  },
);

t.test("Denied calls give an unknown status, not disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = FirewallManagerScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().rejects(awsError("AccessDeniedException"));
  await scan(connector, context, client);

  const state = await connector.resolveStateForServiceFunction(
    WORKLOAD,
    REGION,
    "FMS",
    "GetAdminAccount",
  );
  t.equal(state[0]._error.name, "AccessDeniedException");
  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.parent, WORKLOAD);
  t.equal(status.tenant.tenantId, WORKLOAD);
  t.equal(status.location?.code, REGION);
  t.equal(status.$graph.nodeClass, "informational");
  t.same(status.serviceStatus, {
    service: "fms",
    status: "unknown",
    statusReason: "AccessDeniedException",
    administratorAccountId: undefined,
    relationshipStatus: undefined,
    failedCalls: {
      GetAdminAccount: "AccessDeniedException",
      ListAdminAccountsForOrganization: "AccessDeniedException",
      ListAdminsManagingAccount: "AccessDeniedException",
      ListPolicies: "AccessDeniedException",
    },
  });
});
