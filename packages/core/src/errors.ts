export class NodeConflictError extends Error {
  constructor(nodeId: string) {
    super(`Node ${nodeId} already exists in graph.`);
  }
}

export class EdgeConflictError extends Error {
  constructor(edgeId: string) {
    super(`Edge ${edgeId} already exists in graph.`);
  }
}

export class NodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Node ${nodeId} not found in graph.`);
  }
}

export class EdgeNotFoundError extends Error {
  constructor(edgeId: string) {
    super(`Edge ${edgeId} not found in graph.`);
  }
}
