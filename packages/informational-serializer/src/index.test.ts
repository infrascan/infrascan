import { Graph } from "@infrascan/core";
import type { BaseState, Graph as GraphType } from "@infrascan/shared-types";
import t from "tap";
import { serializeGraph } from "./index";

const ACCOUNT = "123456789012";
const REGION_NODE = `${ACCOUNT}-eu-west-1`;
const LAMBDA_ARN = "arn:aws:lambda:eu-west-1:123456789012:function:api";
const BUCKET_ARN = "arn:aws:s3:::assets";

function baseNode(
  id: string,
  nodeType: string,
  parent: string | undefined,
  extra: Record<string, unknown> = {},
): BaseState {
  return {
    $metadata: { version: "0.1.0", timestamp: 1 },
    $graph: {
      id,
      label: id,
      nodeType,
      nodeClass: "informational",
      parent,
    },
    tenant: { provider: "aws", tenantId: ACCOUNT },
    resource: { id, name: id, category: nodeType },
    ...extra,
  } as BaseState;
}

function buildGraph(): GraphType {
  const graph = Graph();
  graph.addNode(baseNode(ACCOUNT, "AWS-Account", undefined));
  graph.addNode(baseNode(REGION_NODE, "AWS-Region", ACCOUNT));
  graph.addNode(
    baseNode(LAMBDA_ARN, "lambda-function", REGION_NODE, {
      network: { vpc: { id: "vpc-0a1b" }, targetSubnets: ["subnet-0aaa"] },
    }),
  );
  graph.addNode(baseNode(BUCKET_ARN, "s3-bucket", ACCOUNT));
  graph.addEdge({
    source: LAMBDA_ARN,
    target: BUCKET_ARN,
    name: "reads",
    metadata: {},
  });
  return graph;
}

t.test("copies node data without object references", (tap) => {
  const { nodes } = serializeGraph(buildGraph());
  tap.strictSame(
    nodes.map((node) => node.$graph.id),
    [ACCOUNT, REGION_NODE, LAMBDA_ARN, BUCKET_ARN],
  );
  const lambda = nodes.find((node) => node.$graph.id === LAMBDA_ARN)!;
  tap.strictSame(
    lambda,
    baseNode(LAMBDA_ARN, "lambda-function", REGION_NODE, {
      network: { vpc: { id: "vpc-0a1b" }, targetSubnets: ["subnet-0aaa"] },
    }),
  );
  tap.end();
});

t.test("references edge endpoints by id", (tap) => {
  const { edges } = serializeGraph(buildGraph());
  tap.strictSame(edges, [
    {
      id: `${LAMBDA_ARN}-${BUCKET_ARN}`,
      name: "reads",
      source: LAMBDA_ARN,
      target: BUCKET_ARN,
      metadata: {},
    },
  ]);
  tap.end();
});

t.test("does not mutate the input graph", (tap) => {
  const graph = buildGraph();
  const result = serializeGraph(graph);
  result.nodes.forEach((node) => {
    // eslint-disable-next-line no-param-reassign
    node.$graph.label = "changed";
  });
  graph.nodes.forEach((node) => {
    tap.equal(node.$graph.label, node.$graph.id);
  });
  const lambda = graph.getNode(LAMBDA_ARN);
  tap.equal(lambda?.parent?.$graph.id, REGION_NODE);
  tap.ok(lambda?.outgoingEdges[`${LAMBDA_ARN}-${BUCKET_ARN}`]);
  tap.end();
});

t.test("is JSON serializable", (tap) => {
  const result = serializeGraph(buildGraph());
  // throws on the cyclic references between nodes and edges if any remain
  tap.doesNotThrow(() => JSON.stringify(result));
  tap.end();
});
