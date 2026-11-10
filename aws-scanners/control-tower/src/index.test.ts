import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  ControlTowerClient,
  GetLandingZoneCommand,
  ListBaselinesCommand,
  ListEnabledBaselinesCommand,
  ListEnabledControlsCommand,
  ListLandingZonesCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-controltower";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import ControlTowerScanner from ".";
import type {
  EnabledBaselineDetails,
  EnabledControlsDetails,
  GraphState,
  LandingZoneDetails,
} from "./graph";
import { extractManifest } from "./manifest";
import { targetNodeId } from "./arn";

const MANAGEMENT = "111111111111";
const LOG_ARCHIVE = "222222222222";
const AUDIT = "444444444444";
const WORKLOAD = "333333333333";
const HOME = "eu-west-2";
const OTHER = "us-east-1";
const ORG_ID = "o-abc123";
const LZ_ARN = `arn:aws:controltower:${HOME}:${MANAGEMENT}:landingzone/1A2B3C4D5E`;
const SECURITY_OU = `arn:aws:organizations::${MANAGEMENT}:ou/${ORG_ID}/ou-ab12-security`;
const WORKLOAD_ACCOUNT = `arn:aws:organizations::${MANAGEMENT}:account/${ORG_ID}/${WORKLOAD}`;
const BASELINE_ARN = `arn:aws:controltower:${HOME}::baseline/17BSJV3IGJ2QSGA2`;
const ENABLED_BASELINE_ARN = `arn:aws:controltower:${HOME}:${MANAGEMENT}:enabledbaseline/XALULM96QHI525UOC`;
const ACCOUNT_BASELINE_ARN = `arn:aws:controltower:${HOME}:${MANAGEMENT}:enabledbaseline/ACCOUNTBASELINE`;
const control = (id: string) => `arn:aws:controltower:${HOME}::control/${id}`;
const enabledControl = (id: string) =>
  `arn:aws:controltower:${HOME}:${MANAGEMENT}:enabledcontrol/${id}`;

const manifest = {
  governedRegions: [HOME, OTHER],
  organizationStructure: {
    security: { name: "Security" },
    sandbox: { name: "Sandbox" },
  },
  centralizedLogging: {
    accountId: LOG_ARCHIVE,
    enabled: true,
    configurations: { loggingBucket: { retentionDays: 365 } },
  },
  securityRoles: { accountId: AUDIT },
  accessManagement: { enabled: true },
};

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string, region = HOME): AwsContext {
  return { account, region, partition: "aws" };
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: ControlTowerClient,
) {
  for (const getter of ControlTowerScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of ControlTowerScanner.entities ?? []) {
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

function mockHome(client: ControlTowerClient) {
  const mocked = mockClient(client);
  mocked
    .on(ListLandingZonesCommand)
    .resolves({ landingZones: [{ arn: LZ_ARN }] });
  mocked.on(GetLandingZoneCommand).resolves({
    landingZone: {
      arn: LZ_ARN,
      version: "3.3",
      latestAvailableVersion: "4.0",
      status: "ACTIVE",
      driftStatus: { status: "DRIFTED" },
      remediationTypes: ["INHERITANCE_DRIFT"],
      manifest,
    },
  });
  mocked.on(ListBaselinesCommand).resolves({
    baselines: [
      {
        arn: BASELINE_ARN,
        name: "AWSControlTowerBaseline",
        description: "Sets up resources and mandatory controls",
      },
    ],
  });
  mocked.on(ListEnabledBaselinesCommand).resolves({
    enabledBaselines: [
      {
        arn: ENABLED_BASELINE_ARN,
        baselineIdentifier: BASELINE_ARN,
        baselineVersion: "4.0",
        targetIdentifier: SECURITY_OU,
        statusSummary: { status: "SUCCEEDED", lastOperationIdentifier: "op-1" },
        driftStatusSummary: { types: { inheritance: { status: "IN_SYNC" } } },
      },
      {
        arn: ACCOUNT_BASELINE_ARN,
        baselineIdentifier: BASELINE_ARN,
        baselineVersion: "4.0",
        targetIdentifier: WORKLOAD_ACCOUNT,
        parentIdentifier: ENABLED_BASELINE_ARN,
        statusSummary: { status: "SUCCEEDED" },
        driftStatusSummary: { types: { inheritance: { status: "DRIFTED" } } },
      },
    ],
  });
  mocked
    .on(ListEnabledControlsCommand)
    .resolves({
      enabledControls: [
        {
          arn: enabledControl("one"),
          controlIdentifier: control("AWS-GR_ROOT_ACCOUNT_MFA_ENABLED"),
          targetIdentifier: SECURITY_OU,
          statusSummary: { status: "SUCCEEDED" },
          driftStatusSummary: { driftStatus: "IN_SYNC" },
        },
        {
          arn: enabledControl("two"),
          controlIdentifier: control("AWS-GR_RESTRICT_ROOT_USER"),
          targetIdentifier: SECURITY_OU,
          statusSummary: { status: "FAILED" },
          driftStatusSummary: { driftStatus: "DRIFTED" },
        },
      ],
      nextToken: "page-2",
    })
    .on(ListEnabledControlsCommand, { nextToken: "page-2" })
    .resolves({
      enabledControls: [
        {
          arn: enabledControl("three"),
          controlIdentifier: control("AWS-GR_RESTRICT_ROOT_USER"),
          targetIdentifier: WORKLOAD_ACCOUNT,
          parentIdentifier: enabledControl("two"),
          statusSummary: { status: "SUCCEEDED" },
          driftStatusSummary: { driftStatus: "UNKNOWN" },
        },
      ],
    });
  return mocked;
}

t.test(
  "The management account in the home region emits the landing zone, baselines and controls",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = ControlTowerScanner.getClient(fromProcess(), context);
    const mocked = mockHome(client);
    await scan(connector, context, client);

    t.same(
      mocked.commandCalls(GetLandingZoneCommand).map((c) => c.args[0].input),
      [{ landingZoneIdentifier: LZ_ARN }],
    );
    t.equal(mocked.commandCalls(ListEnabledControlsCommand).length, 2);

    const nodes = await nodesFor(connector, context);
    const securityControls = `${SECURITY_OU}#controltower-enabled-controls`;
    const workloadControls = `${WORKLOAD_ACCOUNT}#controltower-enabled-controls`;
    t.same(
      nodes.map((node) => node.$graph.id).sort(),
      [
        securityControls,
        WORKLOAD_ACCOUNT + "#controltower-enabled-controls",
        ACCOUNT_BASELINE_ARN,
        ENABLED_BASELINE_ARN,
        LZ_ARN,
      ].sort(),
    );
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, MANAGEMENT);
      t.equal(node.location?.code, HOME);
      t.equal(node.tenant.tenantId, MANAGEMENT);
      t.equal(node.resource.category, "controltower");
    }

    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    const landingZone = byId.get(LZ_ARN) as GraphState & {
      controltower: { landingZone: LandingZoneDetails };
    };
    t.equal(landingZone.$graph.nodeType, "controltower-landing-zone");
    t.match(landingZone.controltower.landingZone, {
      version: "3.3",
      latestAvailableVersion: "4.0",
      status: "ACTIVE",
      driftStatus: "DRIFTED",
      remediationTypes: ["INHERITANCE_DRIFT"],
      governedRegions: [HOME, OTHER],
      logArchiveAccountId: LOG_ARCHIVE,
      auditAccountId: AUDIT,
      organizationStructure: manifest.organizationStructure,
    });
    t.same(landingZone.controltower.landingZone.manifest, manifest);

    const baseline = byId.get(ENABLED_BASELINE_ARN) as GraphState & {
      controltower: { enabledBaseline: EnabledBaselineDetails };
    };
    t.equal(baseline.$graph.nodeType, "controltower-enabled-baseline");
    t.equal(baseline.$graph.label, "AWSControlTowerBaseline");
    t.match(baseline.controltower.enabledBaseline, {
      baselineIdentifier: BASELINE_ARN,
      baselineName: "AWSControlTowerBaseline",
      baselineVersion: "4.0",
      targetIdentifier: SECURITY_OU,
      statusSummary: { status: "SUCCEEDED", lastOperationIdentifier: "op-1" },
      driftStatusSummary: { types: { inheritance: { status: "IN_SYNC" } } },
    });
    t.equal(
      (
        byId.get(ACCOUNT_BASELINE_ARN) as GraphState & {
          controltower: { enabledBaseline: EnabledBaselineDetails };
        }
      ).controltower.enabledBaseline.parentIdentifier,
      ENABLED_BASELINE_ARN,
    );

    const controls = byId.get(securityControls) as GraphState & {
      controltower: { enabledControls: EnabledControlsDetails };
    };
    t.equal(controls.$graph.nodeType, "controltower-enabled-controls");
    t.equal(
      controls.controltower.enabledControls.targetIdentifier,
      SECURITY_OU,
    );
    t.same(
      controls.controltower.enabledControls.controls.map((c) => [
        c.controlIdentifier,
        c.statusSummary?.status,
        (c.driftStatusSummary as { driftStatus: string }).driftStatus,
      ]),
      [
        [control("AWS-GR_ROOT_ACCOUNT_MFA_ENABLED"), "SUCCEEDED", "IN_SYNC"],
        [control("AWS-GR_RESTRICT_ROOT_USER"), "FAILED", "DRIFTED"],
      ],
    );
    t.equal(
      (
        byId.get(workloadControls) as GraphState & {
          controltower: { enabledControls: EnabledControlsDetails };
        }
      ).controltower.enabledControls.controls[0].parentIdentifier,
      enabledControl("two"),
    );

    const edges = await ControlTowerScanner.getEdges!(connector);
    const edge = (source: string, target: string) =>
      edges.find((e) => e.source === source && e.target === target);
    t.equal(edge(LZ_ARN, LOG_ARCHIVE)?.metadata?.label, "log-archive");
    t.equal(edge(LZ_ARN, AUDIT)?.metadata?.label, "audit");
    t.equal(
      edge(ENABLED_BASELINE_ARN, SECURITY_OU)?.metadata?.label,
      "enabled-on",
    );
    t.equal(
      edge(ACCOUNT_BASELINE_ARN, WORKLOAD)?.metadata?.label,
      "enabled-on",
      "account targets use the account id",
    );
    t.equal(edge(securityControls, SECURITY_OU)?.metadata?.label, "enabled-on");
    t.equal(edge(workloadControls, WORKLOAD)?.metadata?.label, "enabled-on");
    t.equal(edges.length, 6);
  },
);

t.test(
  "A region other than the home region records the errors and emits nothing",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT, OTHER);
    const client = ControlTowerScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(
      new ResourceNotFoundException({
        message: "landing zone not found in this region",
        $metadata: {},
      }),
    );
    mocked.on(ListLandingZonesCommand).resolves({ landingZones: [] });
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(GetLandingZoneCommand).length, 0);
    const state = await connector.resolveStateForServiceFunction(
      MANAGEMENT,
      OTHER,
      "ControlTower",
      "ListEnabledControls",
    );
    t.equal(state[0]._error.name, "ResourceNotFoundException");
    t.same(await nodesFor(connector, context), []);
    t.same(await ControlTowerScanner.getEdges!(connector), []);
  },
);

t.test(
  "A landing zone ARN listed outside its home region does not produce a node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT, OTHER);
    const client = ControlTowerScanner.getClient(fromProcess(), context);
    mockHome(client);
    await scan(connector, context, client);
    t.same(await nodesFor(connector, context), []);
  },
);

t.test("A member account records denied calls and emits nothing", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = ControlTowerScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked
    .onAnyCommand()
    .rejects(new AccessDeniedException({ message: "denied", $metadata: {} }));
  await scan(connector, context, client);
  const state = await connector.resolveStateForServiceFunction(
    WORKLOAD,
    HOME,
    "ControlTower",
    "ListLandingZones",
  );
  t.equal(state[0]._error.name, "AccessDeniedException");
  t.same(await nodesFor(connector, context), []);
});

t.test("Manifest extraction tolerates schema differences", async (t) => {
  t.same(extractManifest(undefined), {});
  t.same(extractManifest("not json"), {});
  t.same(extractManifest(JSON.stringify(manifest)), {
    governedRegions: [HOME, OTHER],
    logArchiveAccountId: LOG_ARCHIVE,
    auditAccountId: AUDIT,
    configAccountId: undefined,
    organizationStructure: manifest.organizationStructure,
  });
  // A newer manifest without organizationStructure and with a separate config account.
  t.same(
    extractManifest({
      governedRegions: [HOME, 42],
      centralizedLogging: { accountId: LOG_ARCHIVE, enabled: true },
      securityRoles: { enabled: true, accountId: AUDIT },
      config: { accountId: AUDIT, enabled: true },
    }),
    {
      governedRegions: [HOME],
      logArchiveAccountId: LOG_ARCHIVE,
      auditAccountId: AUDIT,
      configAccountId: AUDIT,
      organizationStructure: undefined,
    },
  );
  t.same(extractManifest({ governedRegions: "eu-west-2" }), {
    governedRegions: undefined,
    logArchiveAccountId: undefined,
    auditAccountId: undefined,
    configAccountId: undefined,
    organizationStructure: undefined,
  });
});

t.test("Target identifiers map to Organizations node ids", async (t) => {
  t.equal(targetNodeId(SECURITY_OU), SECURITY_OU);
  t.equal(targetNodeId(WORKLOAD_ACCOUNT), WORKLOAD);
  t.equal(targetNodeId("ou-ab12-security"), undefined);
  t.equal(
    targetNodeId(`arn:aws:organizations::${MANAGEMENT}:root/${ORG_ID}/r-ab12`),
    undefined,
  );
  t.equal(targetNodeId(undefined), undefined);
});

t.test(
  "A landing zone whose log archive and audit accounts match gets one edge",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = ControlTowerScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().resolves({});
    mocked
      .on(ListLandingZonesCommand)
      .resolves({ landingZones: [{ arn: LZ_ARN }] });
    mocked.on(GetLandingZoneCommand).resolves({
      landingZone: {
        arn: LZ_ARN,
        version: "3.3",
        manifest: {
          centralizedLogging: { accountId: AUDIT },
          securityRoles: { accountId: AUDIT },
        },
      },
    });
    await scan(connector, context, client);
    t.same(await ControlTowerScanner.getEdges!(connector), [
      {
        source: LZ_ARN,
        target: AUDIT,
        metadata: { label: "log-archive", roles: ["log-archive", "audit"] },
      },
    ]);
  },
);
