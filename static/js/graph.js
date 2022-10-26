window.addEventListener('DOMContentLoaded', async () => {
  const graphData = await fetch('/graph.json')
    .then((res) => res.json());
  const graphStyle = await fetch('/style.json')
    .then((res) => res.json());
  addGraph(graphData, graphStyle);
})

function addGraph(graphData, graphStyle) {
var cy = cytoscape({
  container: document.getElementById('cy'),
  elements: graphData,
  style: graphStyle,
  layout: {
    name: 'grid',
    rows: 5
  }
});
}