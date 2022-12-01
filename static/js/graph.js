window.addEventListener("DOMContentLoaded", async () => {
  const graphData = await fetch("/graph.searchable.json").then((res) =>
    res.json()
  );
  const graphStyle = await fetch("/style.json").then((res) => res.json());
  addGraph(graphData, graphStyle);
});

let removedNodes = [],
  removedEdges = [],
  cy;
function addGraph(graphData, graphStyle) {
  console.log(graphData, graphStyle);
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
   * - If a node with a parent is removed, but the parent is not, when the graph is restored, the child will no longer have the parent (though the parent *will* exist)
   * - Does not follow the entire chain — would like for a double tap to keep all nodes connected by any degree of separation.
   * - Seems inconsistent in whether it keeps nodes based on their connection direction
   * - Fails to restore graph in certain instances based on edges to invalid/non-existant targets
   */
  cy.nodes().on("dbltap", function (e) {
    const tappedParentList = [];
    let parent = e.target.data().id;
    while (parent !== undefined) {
      tappedParentList.push(parent);
      parent = cy.$(`[id = "${parent}"]`).data().parent;
    }
    const tappedNodeNeighbourhoodIds = e.target
      .neighbourhood()
      .map((node) => node.data().id)
      .concat(tappedParentList);
    cy.nodes().forEach((node) => {
      const nodeId = node.data().id;
      const inNeighbourhood = tappedNodeNeighbourhoodIds.includes(nodeId);
      const isConnected = node.edgesWith(e.target).length > 0;
      if (!inNeighbourhood && !isConnected) {
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
