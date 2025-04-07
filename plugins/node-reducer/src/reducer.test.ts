import { EdgeConflictError, Graph } from "@infrascan/core";
import { BaseState, Edge, Node, Readable } from "@infrascan/shared-types";
import t from "tap";
import {
  addEdgeToGraphIfNotExists,
  aggregateByService,
  applyRule,
  reduceGraphWithRules,
  ReducerRule,
} from "./reducer";

t.test(
  "AggregateByService reduces a list of items by the service key",
  (tap) => {
    const items = [
      {
        resource: {
          category: "a",
        },
      },
      {
        resource: {
          category: "a",
        },
      },
      {
        resource: {
          category: "b",
        },
      },
    ] as unknown[] as BaseState[];

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
      $graph: {
        id: "node-1",
        label: "foobar",
        nodeType: "foobar",
      },
    } as unknown as Readable<Node>,
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
      $graph: {
        id: "regex-1",
        label: "foobar",
        nodeType: "foobar",
      },
    } as unknown as Readable<Node>,
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
      $graph: {
        id: "elb-1",
        label: "first elb",
        nodeType: "elb",
      },
    } as unknown as Readable<Node>,
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
      $graph: {
        id: "lambda-1",
        label: "first lambda",
        nodeType: "lambda",
      },
    } as unknown as Readable<Node>,
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
  // @ts-expect-error Rule definition is invalid
  const result = applyRule(invalidRule, {
    $graph: {
      id: "lambda-1",
      label: "first lambda",
      nodeType: "lambda",
    },
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
  // @ts-expect-error Partial graph implementation for test
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
    // @ts-expect-error partial graph implementation for test
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

    const graph = Graph();

    graph.addNode({
      $graph: {
        id: "account",
        label: "account",
        nodeType: "AWS-Account",
      },
      resource: {
        category: "account",
      },
    } as unknown as BaseState<unknown>);

    for (let i = 0; i < 3; i++) {
      graph.addNode({
        $graph: {
          id: `function-${i}`,
          label: `lambda func ${i}`,
          nodeType: "lambda",
          parent: "account",
        },
        resource: {
          category: "lambda",
        },
      } as unknown as BaseState<unknown>);
    }

    for (let i = 0; i < 3; i++) {
      graph.addNode({
        $graph: {
          id: `serverless-${i}`,
          label: `sls bucket ${i}`,
          nodeType: "s3",
          parent: "account",
        },
        resource: {
          category: "s3",
        },
      } as unknown as BaseState<unknown>);
    }

    graph.addNode({
      $graph: {
        id: "ecs-task",
        label: "ecs task",
        nodeType: "ecs",
        parent: "account",
      },
      resource: {
        category: "ecs",
      },
    } as unknown as BaseState<unknown>);

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

    const ruleMap = {
      [lambdaRule.service]: [lambdaRule],
      [s3Rule.service]: [s3Rule],
    };
    reduceGraphWithRules(ruleMap, graph);

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
      collapsedLambdaNode?.incomingEdges[
        `ecs-task-${collapsedLambdaNode.$graph.id}`
      ],
    );

    const collapsedS3Node = graph.getNode(`account-${s3Rule.id}`);
    tap.ok(collapsedS3Node);
    tap.ok(
      collapsedS3Node?.incomingEdges[`ecs-task-${collapsedS3Node.$graph.id}`],
    );

    tap.ok(
      collapsedLambdaNode?.outgoingEdges[
        `${collapsedLambdaNode.$graph.id}-${collapsedS3Node?.$graph?.id}`
      ],
    );

    tap.end();
  },
);
