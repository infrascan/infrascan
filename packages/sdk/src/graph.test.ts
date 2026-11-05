import t from "tap";
import { Graph } from "@infrascan/core";
import type { BaseState } from "@infrascan/shared-types";
import {
  addNodeToGraphUnchecked,
  buildAccountNode,
  generateEdgesForPolicyStatements,
  getStatementsForRole,
  resolveResourceGlob,
} from "./graph";

const queueArn = "arn:aws:sqs:us-east-1:000000000000:queue";
const tableArn = "arn:aws:dynamodb:us-east-1:000000000000:table/test";

t.test(
  "statements without a Resource (NotResource, trust policies) are ignored",
  async ({ same }) => {
    const resources = await generateEdgesForPolicyStatements(
      [
        {
          label: "deny-everything-else",
          statements: [
            { Effect: "Deny", NotAction: "sqs:*", NotResource: queueArn },
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
            { Effect: "Allow", Action: "sqs:SendMessage", Resource: queueArn },
          ],
        },
      ],
      { sqs: [queueArn] },
    );
    same(
      resources.map(({ node }) => node),
      [queueArn],
    );
  },
);

t.test(
  "policies without a document produce no statements, rather than a null statement",
  async ({ same }) => {
    const { inlineStatements, attachedStatements } = getStatementsForRole({
      roleArn: "arn:aws:iam::000000000000:role/test",
      roleName: "test",
      inlinePolicies: [
        { RoleName: "test", PolicyName: "inline", PolicyDocument: undefined },
      ],
      attachedPolicies: [{ PolicyName: "attached-without-version" }],
    });
    const resources = await generateEdgesForPolicyStatements(
      [...inlineStatements, ...attachedStatements],
      { sqs: [queueArn] },
    );
    same(resources, []);
  },
);

t.test(
  "wildcard resources tolerate nodes without an identifier",
  async ({ same }) => {
    const nodes = await resolveResourceGlob(
      "arn:aws:dynamodb:*:*:table/*",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { dynamodb: [tableArn, undefined as any] },
    );
    same(nodes, [tableArn]);
  },
);

t.test("non-string resources are ignored", async ({ same }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  same(await resolveResourceGlob(undefined as any, { sqs: [queueArn] }), []);
  same(await resolveResourceGlob("not-an-arn", { sqs: [queueArn] }), []);
});

t.test("nodes without an identifier are not inserted", async ({ same }) => {
  const graph = Graph();
  addNodeToGraphUnchecked(graph, buildAccountNode("000000000000"));
  addNodeToGraphUnchecked(graph, {
    ...buildAccountNode("000000000000"),
    $graph: {
      label: "replica",
      nodeClass: "visual",
      nodeType: "dynamodb-table",
      parent: "000000000000",
    },
  } as unknown as BaseState);
  same(
    graph.nodes.map((node) => node.$graph.id),
    ["000000000000"],
  );
});
