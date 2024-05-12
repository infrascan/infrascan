import { EdgeConflictError, Graph } from "@infrascan/core";
import {
  addEdgeToGraphIfNotExists,
  aggregateByService,
  applyRule,
  reduceGraphWithRules,
  ReducerRule,
} from "./reducer";

import t from "tap";
import { Edge } from "@infrascan/shared-types";

t.test(
  "AggregateByService reduces a list of items by the service key",
  (tap) => {
    const items = [
      {
        service: "a",
      },
      {
        service: "a",
      },
      {
        service: "b",
      },
    ];

    const { a, b, c } = aggregateByService(items);
    tap.equal(a.length, 2);
    tap.equal(b.length, 1);
    tap.equal(c, undefined);
    tap.end();
  },
);

t.test("applyRule regex rule with no match", (tap) => {
  const matches = applyRule(
    {
      regex: /^regex/g,
      id: "regex-test-1",
      service: "a",
    },
    {
      id: "node-1",
      name: "foobar",
      metadata: {},
      incomingEdges: {},
      outgoingEdges: {},
    },
  );
  tap.equal(matches, false);
  tap.end();
});

t.test("applyRule regex rule with match", (tap) => {
  const matches = applyRule(
    {
      regex: /^regex/g,
      id: "regex-test-1",
      service: "a",
    },
    {
      id: "regex-1",
      name: "foobar",
      metadata: {},
      incomingEdges: {},
      outgoingEdges: {},
    },
  );
  tap.equal(matches, true);
  tap.end();
});

t.test("applyRule glob rule with no match", (tap) => {
  const matches = applyRule(
    {
      glob: "lambda*",
      id: "glob-test-1",
      service: "a",
    },
    {
      id: "elb-1",
      name: "first elb",
      metadata: {},
      incomingEdges: {},
      outgoingEdges: {},
    },
  );
  tap.equal(matches, false);
  tap.end();
});

t.test("applyRule glob rule with match", (tap) => {
  const matches = applyRule(
    {
      glob: "lambda*",
      id: "glob-test-1",
      service: "a",
    },
    {
      id: "lambda-1",
      name: "first lambda",
      metadata: {},
      incomingEdges: {},
      outgoingEdges: {},
    },
  );
  tap.equal(matches, true);
  tap.end();
});

t.test("applyRule with invalid rule", (tap) => {
  const invalidRule = {
    reducedNodeSuffix: "glob-test-1",
    id: "glob-test-1",
    service: "a",
  };
  //@ts-expect-error
  const result = applyRule(invalidRule, {
    id: "lambda-1",
    name: "first lambda",
    metadata: {},
    incomingEdges: {},
    outgoingEdges: {},
  });
  tap.equal(result, false);
  tap.end();
});

t.test("addEdgeToGraphIfNotExists swallows conflict errors", (tap) => {
  const mockGraph = {
    addEdge: (edge: Edge) => {
      throw new EdgeConflictError(edge.id);
    },
  };
  //@ts-expect-error
  addEdgeToGraphIfNotExists(mockGraph, {});
  tap.pass();
  tap.end();
});

t.test("addEdgeToGraphIfNotExists swallows conflict errors", (tap) => {
  const thrownErr = new Error("unexpected error occurred");
  const mockGraph = {
    addEdge: (_: Edge) => {
      throw thrownErr;
    },
  };
  try {
    //@ts-expect-error
    addEdgeToGraphIfNotExists(mockGraph, {});
  } catch (err: unknown) {
    tap.equal(err, thrownErr);
    tap.end();
  }
});

t.test(
  "reduceGraphWithRules collapses the graph per service as expected",
  (tap) => {
    const lambdaRule = {
      id: "lambda-func",
      glob: "function-*",
      service: "lambda",
      reducedNodeSuffix: "lambda-func",
    };

    const s3Rule = {
      id: "serverless-buckets",
      regex: /^serverless-(.)*/,
      service: "s3",
      reducedNodeSuffix: "serverless-buckets",
    };

    const rules: ReducerRule[] = [lambdaRule, s3Rule];
    const graph = Graph();

    graph.addNode({
      id: "account",
      name: "account",
      metadata: {},
      service: "AWS-Account",
    });

    for (let i = 0; i < 3; i++) {
      graph.addNode({
        id: `function-${i}`,
        name: `lambda func ${i}`,
        metadata: {},
        service: "lambda",
        parent: "account",
      });
    }

    for (let i = 0; i < 3; i++) {
      graph.addNode({
        id: `serverless-${i}`,
        name: `sls bucket ${i}`,
        metadata: {},
        service: "s3",
        parent: "account",
      });
    }

    graph.addNode({
      id: "ecs-task",
      name: "ecs task",
      metadata: {},
      service: "ecs",
      parent: "account",
    });

    graph.addEdge({
      metadata: {},
      source: "ecs-task",
      target: "function-1",
    });

    graph.addEdge({
      metadata: {},
      source: "ecs-task",
      target: "serverless-2",
    });

    graph.addEdge({
      metadata: {},
      source: "function-2",
      target: "serverless-0",
    });

    reduceGraphWithRules(aggregateByService(rules), graph);

    // attempt to retrieve original nodes targetted by reducer
    for (let i = 0; i < 3; i++) {
      tap.equal(graph.getNode(`function-${i}`), undefined);
      tap.equal(graph.getNode(`serverless-${i}`), undefined);
    }

    // ECS task is untouched
    const ecsTask = graph.getNode("ecs-task");
    tap.ok(ecsTask);

    tap.equal(Object.values(ecsTask?.outgoingEdges ?? {}).length, 2);

    const collapsedLambdaNode = graph.getNode(`account-${lambdaRule.id}`);
    tap.ok(collapsedLambdaNode);
    tap.ok(
      collapsedLambdaNode?.incomingEdges[`ecs-task-${collapsedLambdaNode.id}`],
    );

    const collapsedS3Node = graph.getNode(`account-${s3Rule.id}`);
    tap.ok(collapsedS3Node);
    tap.ok(collapsedS3Node?.incomingEdges[`ecs-task-${collapsedS3Node.id}`]);

    tap.ok(
      collapsedLambdaNode?.outgoingEdges[
        `${collapsedLambdaNode.id}-${collapsedS3Node?.id}`
      ],
    );

    tap.end();
  },
);
