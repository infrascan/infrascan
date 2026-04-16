import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListRolesCommand,
  ListRolePoliciesCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-iam";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import IamScanner from ".";
import { IamRoleEntity, IamPolicyEntity } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

const testContext = {
  region: "us-east-1",
  account: "0".repeat(12),
};

// Helpers
function encodePolicy(doc: object): string {
  return encodeURIComponent(JSON.stringify(doc));
}

const inlinePolicyDoc = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
};

const assumeRolePolicyDoc = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const roleOneName = "test-role-1";
const roleOneId = "AROAIOSFODNN7EXAMPLE1";
const roleOneArn = `arn:aws:iam::${testContext.account}:role/${roleOneName}`;

const roleTwoName = "test-role-2";
const roleTwoId = "AROAIOSFODNN7EXAMPLE2";
const roleTwoArn = `arn:aws:iam::${testContext.account}:role/${roleTwoName}`;

const inlinePolicyName = "inline-policy-1";
const attachedPolicyArn = "arn:aws:iam::aws:policy/ReadOnlyAccess";
const attachedPolicyName = "ReadOnlyAccess";
const attachedPolicyId = "ANPAIOSFODNN7EXAMPLE1";

t.test(
  "State is pulled correctly from IAM, and formatted as expected",
  async ({ ok, equal, match }) => {
    const iamClient = IamScanner.getClient(fromProcess(), testContext);
    const mockedIamClient = mockClient(iamClient);

    // ListRoles — two pages
    const listRolesPaginationToken = "next-roles-page";
    mockedIamClient
      .on(ListRolesCommand)
      .resolvesOnce({
        Roles: [
          {
            RoleName: roleOneName,
            RoleId: roleOneId,
            Arn: roleOneArn,
            Path: "/",
            CreateDate: new Date("2024-01-01"),
            AssumeRolePolicyDocument: encodePolicy(assumeRolePolicyDoc),
            MaxSessionDuration: 3600,
          },
        ],
        Marker: listRolesPaginationToken,
        IsTruncated: true,
      })
      .resolvesOnce({
        Roles: [
          {
            RoleName: roleTwoName,
            RoleId: roleTwoId,
            Arn: roleTwoArn,
            Path: "/service-role/",
            CreateDate: new Date("2024-02-01"),
            AssumeRolePolicyDocument: encodePolicy(assumeRolePolicyDoc),
          },
        ],
        IsTruncated: false,
      });

    // ListRolePolicies — role-1 has one inline policy, role-2 has none
    mockedIamClient
      .on(ListRolePoliciesCommand, { RoleName: roleOneName })
      .resolves({ PolicyNames: [inlinePolicyName], IsTruncated: false });
    mockedIamClient
      .on(ListRolePoliciesCommand, { RoleName: roleTwoName })
      .resolves({ PolicyNames: [], IsTruncated: false });

    // GetRolePolicy — only called for role-1's inline policy
    mockedIamClient.on(GetRolePolicyCommand).resolves({
      RoleName: roleOneName,
      PolicyName: inlinePolicyName,
      PolicyDocument: encodePolicy(inlinePolicyDoc),
    });

    // ListAttachedRolePolicies — role-1 has one attached policy, role-2 has none
    mockedIamClient
      .on(ListAttachedRolePoliciesCommand, { RoleName: roleOneName })
      .resolves({
        AttachedPolicies: [
          { PolicyName: attachedPolicyName, PolicyArn: attachedPolicyArn },
        ],
        IsTruncated: false,
      });
    mockedIamClient
      .on(ListAttachedRolePoliciesCommand, { RoleName: roleTwoName })
      .resolves({ AttachedPolicies: [], IsTruncated: false });

    // GetPolicy — called for the one attached policy ARN
    mockedIamClient
      .on(GetPolicyCommand, { PolicyArn: attachedPolicyArn })
      .resolves({
        Policy: {
          PolicyName: attachedPolicyName,
          PolicyId: attachedPolicyId,
          Arn: attachedPolicyArn,
          Path: "/",
          DefaultVersionId: "v1",
          AttachmentCount: 1,
          PermissionsBoundaryUsageCount: 0,
          IsAttachable: true,
          CreateDate: new Date("2023-01-01"),
          UpdateDate: new Date("2023-01-01"),
        },
      });

    for (const scannerFn of IamScanner.getters) {
      await scannerFn(iamClient, connector, testContext);
    }

    // ListRoles pagination: two pages called
    equal(mockedIamClient.commandCalls(ListRolesCommand).length, 2);
    equal(
      mockedIamClient.commandCalls(ListRolesCommand).at(1)?.args[0].input
        .Marker,
      listRolesPaginationToken,
    );

    // ListRolePolicies called once per role
    equal(mockedIamClient.commandCalls(ListRolePoliciesCommand).length, 2);

    // GetRolePolicy only called for role-1's single inline policy
    equal(mockedIamClient.commandCalls(GetRolePolicyCommand).length, 1);
    equal(
      mockedIamClient.commandCalls(GetRolePolicyCommand).at(0)?.args[0].input
        .RoleName,
      roleOneName,
    );
    equal(
      mockedIamClient.commandCalls(GetRolePolicyCommand).at(0)?.args[0].input
        .PolicyName,
      inlinePolicyName,
    );

    // ListAttachedRolePolicies called once per role
    equal(
      mockedIamClient.commandCalls(ListAttachedRolePoliciesCommand).length,
      2,
    );

    // GetPolicy called once for the one unique attached policy ARN
    equal(mockedIamClient.commandCalls(GetPolicyCommand).length, 1);
    equal(
      mockedIamClient.commandCalls(GetPolicyCommand).at(0)?.args[0].input
        .PolicyArn,
      attachedPolicyArn,
    );

    // --- IamRoleEntity nodes ---
    const roleNodeProducer = generateNodesFromEntity(
      connector,
      testContext,
      IamRoleEntity,
    );
    const roleNodes = [];
    for await (const node of roleNodeProducer) {
      roleNodes.push(node);
      ok(node.$graph.id, "role node has a graph id");
      ok(node.$graph.label, "role node has a graph label");
      equal(node.$graph.nodeClass, "informational");
      equal(node.$graph.nodeType, "iam-role");
      equal(node.$graph.parent, testContext.account);
      ok(node.$metadata.version, "role node has metadata version");
      equal(node.tenant.tenantId, testContext.account);
      equal(node.tenant.provider, "aws");
      ok(node.location?.code, "role node has a location code");
      equal(node.$source?.command, IamRoleEntity.command);
      equal(node.resource.category, IamRoleEntity.category);
      equal(node.resource.subcategory, IamRoleEntity.subcategory);
      ok(node.audit?.createdAt, "role node has an audit createdAt");
    }

    equal(roleNodes.length, 2, "one node per role");

    // Validate role-1 has its policies populated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleOneNode = roleNodes.find((n: any) => n.$graph.id === roleOneId) as any;
    ok(roleOneNode, "role-1 node exists");
    equal(roleOneNode.iamRole.path, "/");
    equal(roleOneNode.iamRole.maxSessionDuration, 3600);
    match(roleOneNode.iamRole.assumeRolePolicy, assumeRolePolicyDoc);
    equal(roleOneNode.iamRole.inlinePolicies.length, 1);
    equal(roleOneNode.iamRole.inlinePolicies[0].name, inlinePolicyName);
    match(roleOneNode.iamRole.inlinePolicies[0].document, inlinePolicyDoc);
    equal(roleOneNode.iamRole.attachedPolicies.length, 1);
    equal(roleOneNode.iamRole.attachedPolicies[0].PolicyArn, attachedPolicyArn);

    // Validate role-2 has empty policy arrays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleTwoNode = roleNodes.find((n: any) => n.$graph.id === roleTwoId) as any;
    ok(roleTwoNode, "role-2 node exists");
    equal(roleTwoNode.iamRole.inlinePolicies.length, 0);
    equal(roleTwoNode.iamRole.attachedPolicies.length, 0);

    // --- IamPolicyEntity nodes ---
    const policyNodeProducer = generateNodesFromEntity(
      connector,
      testContext,
      IamPolicyEntity,
    );
    const policyNodes = [];
    for await (const node of policyNodeProducer) {
      policyNodes.push(node);
      ok(node.$graph.id, "policy node has a graph id");
      ok(node.$graph.label, "policy node has a graph label");
      equal(node.$graph.nodeClass, "informational");
      equal(node.$graph.nodeType, "iam-policy");
      equal(node.$graph.parent, testContext.account);
      ok(node.$metadata.version, "policy node has metadata version");
      equal(node.tenant.tenantId, testContext.account);
      equal(node.tenant.provider, "aws");
      ok(node.location?.code, "policy node has a location code");
      equal(node.$source?.command, IamPolicyEntity.command);
      equal(node.resource.category, IamPolicyEntity.category);
      equal(node.resource.subcategory, IamPolicyEntity.subcategory);
      ok(node.audit?.createdAt, "policy node has an audit createdAt");
    }

    equal(policyNodes.length, 1, "one node per attached policy");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyNode = policyNodes[0] as any;
    ok(policyNode, "policy node exists");
    equal(policyNode.$graph.id, attachedPolicyArn);
    equal(policyNode.$graph.label, attachedPolicyName);
    equal(policyNode.iamPolicy.id, attachedPolicyId);
    equal(policyNode.iamPolicy.path, "/");
    equal(policyNode.iamPolicy.defaultVersionId, "v1");
    equal(policyNode.iamPolicy.attachmentCount, 1);
    equal(policyNode.iamPolicy.permissionsBoundaryUsageCount, 0);
  },
);

t.test("No roles returned from ListRolesCommand", async ({ equal }) => {
  const iamClient = IamScanner.getClient(fromProcess(), testContext);
  const mockedIamClient = mockClient(iamClient);

  mockedIamClient.on(ListRolesCommand).resolves({
    Roles: [],
    IsTruncated: false,
  });

  for (const scannerFn of IamScanner.getters) {
    await scannerFn(iamClient, connector, testContext);
  }

  equal(mockedIamClient.commandCalls(ListRolesCommand).length, 1);
  // No roles means no downstream calls
  equal(mockedIamClient.commandCalls(ListRolePoliciesCommand).length, 0);
  equal(mockedIamClient.commandCalls(GetRolePolicyCommand).length, 0);
  equal(mockedIamClient.commandCalls(ListAttachedRolePoliciesCommand).length, 0);
  equal(mockedIamClient.commandCalls(GetPolicyCommand).length, 0);
});

t.test(
  "IamPolicyEntity produces no nodes when no attached policies exist",
  async ({ equal }) => {
    const iamClient = IamScanner.getClient(fromProcess(), testContext);
    const mockedIamClient = mockClient(iamClient);

    mockedIamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleName: roleOneName,
          RoleId: roleOneId,
          Arn: roleOneArn,
          Path: "/",
          CreateDate: new Date("2024-01-01"),
          AssumeRolePolicyDocument: encodePolicy(assumeRolePolicyDoc),
        },
      ],
      IsTruncated: false,
    });

    mockedIamClient
      .on(ListRolePoliciesCommand)
      .resolves({ PolicyNames: [], IsTruncated: false });

    mockedIamClient
      .on(ListAttachedRolePoliciesCommand)
      .resolves({ AttachedPolicies: [], IsTruncated: false });

    for (const scannerFn of IamScanner.getters) {
      await scannerFn(iamClient, connector, testContext);
    }

    // No attached policies means GetPolicy is never called
    equal(mockedIamClient.commandCalls(GetPolicyCommand).length, 0);

    const policyNodeProducer = generateNodesFromEntity(
      connector,
      testContext,
      IamPolicyEntity,
    );
    const policyNodes = [];
    for await (const node of policyNodeProducer) {
      policyNodes.push(node);
    }
    equal(policyNodes.length, 0, "no policy nodes when no attached policies");
  },
);
