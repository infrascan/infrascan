export type GraphNode = {
  group: "nodes";
  id: string;
  data: {
    id: string;
    type: string;
    parent?: string;
  };
  metadata?: any;
};

export type GraphEdge = {
  group: "edges";
  id: string;
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

export type State<T> = {
  _metadata: {
    account: string;
    region: string;
  };
  _result: T;
  _parameters?: any;
};

export type GenericState = State<any>;
