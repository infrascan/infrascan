import t from "tap";
import { IAMStorage } from "./aws/helpers/iam";
import type { StoredRole } from "./aws/helpers/iam";
import type { ServiceNodesMap } from "./index";
import {
  getStatementsForRole,
  resolveResourceGlob,
  generateEdgesForPolicyStatements,
  generateEdgesForRole,
} from "./graph";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const account = "0".repeat(12);
const region = "us-east-1";

const roleArn = `arn:aws:iam::${account}:role/test-role`;
const roleName = "test-role";

const s3BucketArn = "arn:aws:s3:::my-bucket";
const lambdaFnArn = `arn:aws:lambda:${region}:${account}:function:my-fn`;
const lambdaFn2Arn = `arn:aws:lambda:${region}:${account}:function:other-fn`;

const inlinePolicyStatement = {
  Effect: "Allow",
  Action: "s3:GetObject",
  Resource: s3BucketArn,
};

const attachedPolicyStatement = {
  Effect: "Allow",
  Action: "lambda:InvokeFunction",
  Resource: lambdaFnArn,
};

const baseNodesMap: ServiceNodesMap = {
  s3: [s3BucketArn],
  lambda: [lambdaFnArn, lambdaFn2Arn],
};

// ---------------------------------------------------------------------------
// getStatementsForRole
// ---------------------------------------------------------------------------

t.test("getStatementsForRole — inline policy only", ({ equal, match, end }) => {
  const role: StoredRole = {
    roleArn,
    roleName,
    inlinePolicies: [
      {
        RoleName: roleName,
        PolicyName: "MyInlinePolicy",
        PolicyDocument: { Statement: [inlinePolicyStatement] },
      },
    ],
  };

  const { inlineStatements, attachedStatements } = getStatementsForRole(role);

  equal(inlineStatements.length, 1);
  equal(inlineStatements[0].label, "MyInlinePolicy");
  match(inlineStatements[0].statements, [inlinePolicyStatement]);
  equal(attachedStatements.length, 0);
  end();
});

t.test(
  "getStatementsForRole — attached policy only",
  ({ equal, match, end }) => {
    const role: StoredRole = {
      roleArn,
      roleName,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      attachedPolicies: [
        {
          PolicyName: "ReadOnly",
          Document: { Statement: [attachedPolicyStatement] },
        } as any,
      ],
    };

    const { inlineStatements, attachedStatements } = getStatementsForRole(role);

    equal(inlineStatements.length, 0);
    equal(attachedStatements.length, 1);
    equal(attachedStatements[0].label, "ReadOnly");
    match(attachedStatements[0].statements, [attachedPolicyStatement]);
    end();
  },
);

t.test(
  "getStatementsForRole — both inline and attached",
  ({ equal, end }) => {
    const role: StoredRole = {
      roleArn,
      roleName,
      inlinePolicies: [
        {
          RoleName: roleName,
          PolicyName: "InlineP",
          PolicyDocument: { Statement: [inlinePolicyStatement] },
        },
      ],
      /* eslint-disable @typescript-eslint/no-explicit-any */
      attachedPolicies: [
        {
          PolicyName: "AttachedP",
          Document: { Statement: [attachedPolicyStatement] },
        } as any,
      ],
    };

    const { inlineStatements, attachedStatements } = getStatementsForRole(role);

    equal(inlineStatements.length, 1);
    equal(attachedStatements.length, 1);
    end();
  },
);

t.test(
  "getStatementsForRole — no policies (undefined fields)",
  ({ equal, end }) => {
    const role: StoredRole = { roleArn, roleName };

    const { inlineStatements, attachedStatements } = getStatementsForRole(role);

    equal(inlineStatements.length, 0);
    equal(attachedStatements.length, 0);
    end();
  },
);

// ---------------------------------------------------------------------------
// resolveResourceGlob
// ---------------------------------------------------------------------------

t.test(
  'resolveResourceGlob — "*" returns empty array',
  async ({ equal }) => {
    const result = await resolveResourceGlob("*", baseNodesMap);
    equal(result.length, 0);
  },
);

t.test(
  "resolveResourceGlob — unknown service returns empty array",
  async ({ equal }) => {
    const result = await resolveResourceGlob(
      `arn:aws:dynamodb:${region}:${account}:table/my-table`,
      baseNodesMap,
    );
    equal(result.length, 0);
  },
);

t.test(
  "resolveResourceGlob — exact ARN match returns that ARN",
  async ({ equal, same }) => {
    const result = await resolveResourceGlob(s3BucketArn, baseNodesMap);
    equal(result.length, 1);
    same(result, [s3BucketArn]);
  },
);

t.test(
  "resolveResourceGlob — wildcard ARN matches subset of nodes",
  async ({ equal, ok }) => {
    // Matches only my-fn, not other-fn
    const pattern = `arn:aws:lambda:${region}:${account}:function:my-*`;
    const result = await resolveResourceGlob(pattern, baseNodesMap);
    equal(result.length, 1);
    ok(result.includes(lambdaFnArn));
  },
);

t.test(
  "resolveResourceGlob — wildcard ARN matching nothing returns empty",
  async ({ equal }) => {
    const pattern = `arn:aws:lambda:${region}:${account}:function:nonexistent-*`;
    const result = await resolveResourceGlob(pattern, baseNodesMap);
    equal(result.length, 0);
  },
);

// ---------------------------------------------------------------------------
// generateEdgesForPolicyStatements
// ---------------------------------------------------------------------------

t.test(
  "generateEdgesForPolicyStatements — empty list returns empty",
  async ({ equal }) => {
    const result = await generateEdgesForPolicyStatements([], baseNodesMap);
    equal(result.length, 0);
  },
);

t.test(
  "generateEdgesForPolicyStatements — specific ARN produces one edge resource",
  async ({ equal, match }) => {
    const statements = [
      {
        label: "MyPolicy",
        statements: [{ Effect: "Allow", Action: "s3:GetObject", Resource: s3BucketArn }],
      },
    ];
    const result = await generateEdgesForPolicyStatements(
      statements,
      baseNodesMap,
    );
    equal(result.length, 1);
    equal(result[0].label, "MyPolicy");
    equal(result[0].node, s3BucketArn);
    match(result[0].statement, { Resource: s3BucketArn });
  },
);

t.test(
  "generateEdgesForPolicyStatements — wildcard ARN produces multiple edge resources",
  async ({ equal }) => {
    const pattern = `arn:aws:lambda:${region}:${account}:function:*`;
    const statements = [
      {
        label: "LambdaPolicy",
        statements: [
          { Effect: "Allow", Action: "lambda:InvokeFunction", Resource: pattern },
        ],
      },
    ];
    const result = await generateEdgesForPolicyStatements(
      statements,
      baseNodesMap,
    );
    equal(result.length, 2);
  },
);

t.test(
  'generateEdgesForPolicyStatements — "*" resource returns empty',
  async ({ equal }) => {
    const statements = [
      {
        label: "WildPolicy",
        statements: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }],
      },
    ];
    const result = await generateEdgesForPolicyStatements(
      statements,
      baseNodesMap,
    );
    equal(result.length, 0);
  },
);

t.test(
  "generateEdgesForPolicyStatements — Resource as array produces one edge per match",
  async ({ equal }) => {
    const statements = [
      {
        label: "MultiResource",
        statements: [
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: [lambdaFnArn, lambdaFn2Arn],
          },
        ],
      },
    ];
    const result = await generateEdgesForPolicyStatements(
      statements,
      baseNodesMap,
    );
    equal(result.length, 2);
  },
);

// ---------------------------------------------------------------------------
// generateEdgesForRole
// ---------------------------------------------------------------------------

t.test(
  "generateEdgesForRole — role ARN not in storage returns empty",
  async ({ equal }) => {
    const storage = new IAMStorage();
    const result = await generateEdgesForRole(
      storage,
      roleArn,
      "arn:aws:lambda:us-east-1:000000000000:function:executor",
      baseNodesMap,
    );
    equal(result.length, 0);
  },
);

t.test(
  "generateEdgesForRole — inline policy produces edges with correct metadata",
  async ({ equal, ok }) => {
    const executorArn = `arn:aws:lambda:${region}:${account}:function:executor`;
    const storage = new IAMStorage();
    storage.setRole(roleArn, {
      roleArn,
      roleName,
      inlinePolicies: [
        {
          RoleName: roleName,
          PolicyName: "InlineP",
          PolicyDocument: {
            Statement: [
              {
                Effect: "Allow",
                Action: "s3:GetObject",
                Resource: s3BucketArn,
              },
            ],
          },
        },
      ],
    });

    const edges = await generateEdgesForRole(
      storage,
      roleArn,
      executorArn,
      baseNodesMap,
    );

    equal(edges.length, 1);
    equal(edges[0].source, executorArn);
    equal(edges[0].target, s3BucketArn);
    ok(edges[0].metadata);
    equal((edges[0].metadata as Record<string, unknown>).roleArn, roleArn);
  },
);

t.test(
  "generateEdgesForRole — attached policy produces edges",
  async ({ equal }) => {
    const executorArn = `arn:aws:lambda:${region}:${account}:function:executor`;
    const storage = new IAMStorage();
    storage.setRole(roleArn, {
      roleArn,
      roleName,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      attachedPolicies: [
        {
          PolicyName: "AttachedP",
          Document: {
            Statement: [
              {
                Effect: "Allow",
                Action: "lambda:InvokeFunction",
                Resource: lambdaFnArn,
              },
            ],
          },
        } as any,
      ],
    });

    const edges = await generateEdgesForRole(
      storage,
      roleArn,
      executorArn,
      baseNodesMap,
    );

    equal(edges.length, 1);
    equal(edges[0].target, lambdaFnArn);
  },
);

t.test(
  "generateEdgesForRole — both inline and attached produce edges from both",
  async ({ equal }) => {
    const executorArn = `arn:aws:lambda:${region}:${account}:function:executor`;
    const storage = new IAMStorage();
    storage.setRole(roleArn, {
      roleArn,
      roleName,
      inlinePolicies: [
        {
          RoleName: roleName,
          PolicyName: "InlineP",
          PolicyDocument: {
            Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: s3BucketArn }],
          },
        },
      ],
      /* eslint-disable @typescript-eslint/no-explicit-any */
      attachedPolicies: [
        {
          PolicyName: "AttachedP",
          Document: {
            Statement: [
              { Effect: "Allow", Action: "lambda:InvokeFunction", Resource: lambdaFnArn },
            ],
          },
        } as any,
      ],
    });

    const edges = await generateEdgesForRole(
      storage,
      roleArn,
      executorArn,
      baseNodesMap,
    );

    equal(edges.length, 2);
    const targets = edges.map((e) => e.target).sort();
    const expected = [s3BucketArn, lambdaFnArn].sort();
    equal(targets[0], expected[0]);
    equal(targets[1], expected[1]);
  },
);

t.test(
  'generateEdgesForRole — inline policy with Resource "*" returns no edges',
  async ({ equal }) => {
    const executorArn = `arn:aws:lambda:${region}:${account}:function:executor`;
    const storage = new IAMStorage();
    storage.setRole(roleArn, {
      roleArn,
      roleName,
      inlinePolicies: [
        {
          RoleName: roleName,
          PolicyName: "WildPolicy",
          PolicyDocument: {
            Statement: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }],
          },
        },
      ],
    });

    const edges = await generateEdgesForRole(
      storage,
      roleArn,
      executorArn,
      baseNodesMap,
    );

    equal(edges.length, 0);
  },
);
