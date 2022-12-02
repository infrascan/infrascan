window.addEventListener("DOMContentLoaded", async () => {
  const graphData = await fetch("/graph.json").then((res) => res.json());
  const graphStyle = await fetch("/style.json").then((res) => res.json());
  addGraph(graphData, graphStyle);
});

let removedNodes = [],
  removedEdges = [],
  cy;
function addGraph(graphData, graphStyle) {
  cy = cytoscape({
    container: document.getElementById("cy"),
    elements: graphData,
    style: graphStyle,
    layout: {
      name: "cose-bilkent",
    },
  });
  cy.nodes().on("tap", function (e) {
    const isDirectTap = e.target.same(this);
    if (isDirectTap) {
      document.getElementById("focus-content").innerHTML = JSON.stringify(
        this.data(),
        undefined,
        2
      );
      e.stopPropagation();
    }
  });
  /**
   * Double tap to show a specific section of the infrastructure. Currently has some weird behaviour:
   * - Fails to restore graph in certain instances based on edges to invalid/non-existant targets
   */
  cy.nodes().on("dbltap", function (e) {
    // use depth first traversal with no goal to get the entire path for the clicked node
    const { path } = cy.elements().dfs({
      roots: `[id = "${e.target.data().id}"]`,
    });
    // step over every node on the path and get their parents (some unnecessary work being done here)
    const allNodesToRetain = path.flatMap((nodeOnPath) => {
      const succ = nodeOnPath.successors().map((node) => node.data().id);
      const incom = nodeOnPath.predecessors().map((node) => node.data().id);
      let allNodesToRetain = succ.concat(incom);
      allNodesToRetain.push(nodeOnPath.data().id);
      const ancestorIds = nodeOnPath
        .ancestors()
        .map((ancestorNode) => ancestorNode.data().id);
      allNodesToRetain = allNodesToRetain.concat(ancestorIds);
      const descendantIds = nodeOnPath
        .descendants()
        .map((descendantNode) => descendantNode.data().id);
      return allNodesToRetain.concat(descendantIds);
    });
    // remove all nodes not included in the path + parents
    cy.nodes().forEach((node) => {
      const nodeId = node.data().id;
      const shouldNodeBeRetained = allNodesToRetain.includes(nodeId);
      if (!shouldNodeBeRetained) {
        node.connectedEdges().forEach((edge) => {
          const edgeId = edge.data().id;
          const removedEdge = cy.$(`[id = "${edgeId}"]`).remove();
          removedEdges.push(removedEdge);
        });
        const removedNode = cy.$(`[id = "${nodeId}"]`).remove();
        removedNodes.push(removedNode);
      }
    });
    toggleRestoreButton();
    e.stopPropagation();
  });
}

function toggleRestoreButton() {
  const restoreNodesBtn = document.getElementById("restore-nodes");
  const haveAlreadyRemovedElems =
    removedNodes.length > 0 || removedEdges.length > 0;
  const isButtonAlreadyVisible = !restoreNodesBtn.classList.contains("hidden");
  if (!(haveAlreadyRemovedElems && isButtonAlreadyVisible)) {
    restoreNodesBtn.classList.toggle("hidden");
  }
}

function restoreRemovedNodes() {
  if (removedNodes.length > 0) {
    for (let removedNode of removedNodes) {
      removedNode.restore();
    }
    removedNodes = [];
  }
  if (removedEdges.length > 0) {
    for (let removedEdge of removedEdges) {
      removedEdge.restore();
    }
    removedEdges = [];
  }
  toggleRestoreButton();
}
