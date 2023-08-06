export type GraphNode = {
  group: "nodes";
  id: string;
  data: {
    id: string;
    type: string;
    parent?: string;
    name?: string;
  };
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
    statement: any;
  };
};

export type GraphElement = GraphNode | GraphEdge;

export type GetGlobalStateForServiceAndFunction = (
  service: string,
  functionName: string
) => any;
