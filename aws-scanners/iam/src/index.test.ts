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
} from "@aws-sdk/client-iam";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import IamScanner from ".";

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
    equal(
      mockedIamClient.commandCalls(ListRolePoliciesCommand).length,
      2,
    );

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

    // Entity produces correct nodes
    for (const entity of IamScanner.entities ?? []) {
      const nodeProducer = generateNodesFromEntity(
        connector,
        testContext,
        entity,
      );
      const nodes = [];
      for await (const node of nodeProducer) {
        nodes.push(node);
        ok(node.$graph.id, "node has a graph id");
        ok(node.$graph.label, "node has a graph label");
        equal(node.$graph.nodeClass, "informational");
        equal(node.$graph.nodeType, "iam-role");
        equal(node.$graph.parent, testContext.account);
        ok(node.$metadata.version, "node has metadata version");
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        ok(node.location?.code, "node has a location code");
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        ok(node.audit?.createdAt, "node has an audit createdAt");
      }

      equal(nodes.length, 2, "one node per role");

      // Validate role-1 has its policies populated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roleOneNode = nodes.find((n: any) => n.$graph.id === roleOneId) as any;
      ok(roleOneNode, "role-1 node exists");
      equal(roleOneNode.iam_role.path, "/");
      equal(roleOneNode.iam_role.maxSessionDuration, 3600);
      match(roleOneNode.iam_role.assumeRolePolicy, assumeRolePolicyDoc);
      equal(roleOneNode.iam_role.inlinePolicies.length, 1);
      equal(roleOneNode.iam_role.inlinePolicies[0].name, inlinePolicyName);
      match(roleOneNode.iam_role.inlinePolicies[0].document, inlinePolicyDoc);
      equal(roleOneNode.iam_role.attachedPolicies.length, 1);
      equal(roleOneNode.iam_role.attachedPolicies[0].PolicyArn, attachedPolicyArn);

      // Validate role-2 has empty policy arrays
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roleTwoNode = nodes.find((n: any) => n.$graph.id === roleTwoId) as any;
      ok(roleTwoNode, "role-2 node exists");
      equal(roleTwoNode.iam_role.inlinePolicies.length, 0);
      equal(roleTwoNode.iam_role.attachedPolicies.length, 0);
    }
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
});
