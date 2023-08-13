export type GraphNode = {
  group: "nodes";
  id: string;
  data: {
    id: string;
    type: string;
    parent?: string;
    name?: string;
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  metadata?: any;
};

export type GraphEdge = {
  group: "edges";
  id?: string;
  data: {
    id: string;
    name: string;
    source: string;
    target: string;
    type: string;
  };
  metadata?: {
    label: string;
    roleArn?: string;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    statement: any;
  };
};

export type GraphElement = GraphNode | GraphEdge;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GetGlobalStateForServiceAndFunction = (
  service: string,
  functionName: string
) => any;
