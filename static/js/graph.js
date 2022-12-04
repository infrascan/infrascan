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

    const retainedElems = cy.$(
      allNodesToRetain.map((id) => `[id="${id}"]`).join(",")
    );

    // Rerun layout on subset of the graph to make it readable
    retainedElems
      .layout({
        name: "cose-bilkent",
      })
      .run();

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

function autocomplete(e) {
  const selectedPrompt = e.target.innerText;
  document.getElementById("node-search").value = selectedPrompt;
  focusOnNode(selectedPrompt);
}

function focusOnNode(id) {
  const foundNode = cy.$(`[ id = "${id}"]`);
  if (foundNode) {
    foundNode.select();
    cy.animation({
      fit: {
        eles: foundNode,
        padding: 220,
      },
    }).run();
    clearSuggestions();
  }
}

function clearSuggestions() {
  const dropdown = document.getElementById("suggestions");
  for (let child of dropdown.children) {
    child.remove();
  }
}

async function findNode() {
  const { value } = document.getElementById("node-search");
  const normalizedValue = value.trim();
  if (normalizedValue === "") {
    clearSuggestions();
    return;
  }
  console.log("searching", normalizedValue);

  const nodes = await fetch("http://localhost:7700/indexes/graph/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test",
    },
    body: JSON.stringify({ q: normalizedValue, filter: "group = nodes" }),
  });

  const { hits } = await nodes.json();
  const promptElems = hits.map(({ data }) => {
    const elem = document.createElement("li");
    elem.classList.toggle("prompt");
    elem.onclick = autocomplete;
    elem.innerText = data.id;
    return elem;
  });
  clearSuggestions();
  const dropdown = document.getElementById("suggestions");
  for (let prompt of promptElems) {
    dropdown.appendChild(prompt);
  }
}
