window.addEventListener("DOMContentLoaded", async () => {
  const graphData = await fetch("/graph-1669680082218.json").then((res) =>
    res.json()
  );
  const graphStyle = await fetch("/style.json").then((res) => res.json());
  addGraph(graphData, graphStyle);
});

function addGraph(graphData, graphStyle) {
  var cy = cytoscape({
    container: document.getElementById("cy"),
    elements: graphData,
    style: graphStyle,
    layout: {
      name: "cose",
      // rows: 5
    },
  });
  cy.nodes().on("tap", function (_) {
    document.getElementById("focus-content").innerHTML = JSON.stringify(
      this.data(),
      undefined,
      2
    );
  });
}
