import type {
  CytoscapeNode as Node,
  CytoscapeEdge as Edge,
} from "@infrascan/cytoscape-serializer";
import type { Core, CytoscapeOptions } from "cytoscape";

type GraphElement = Node | Edge;

function buildNode(id: string): Node {
  return {
    group: "nodes",
    data: { id },
  };
}

function buildEdge(id: string, source: string, target: string): Edge {
  return {
    group: "edges",
    data: { id, name: id, source, target },
  };
}

export const DEFAULT_GRAPH_CONTENT: GraphElement[] = [
  buildNode("node-1"),
  buildNode("node-2"),
  buildNode("node-3"),
  buildEdge("edge-1", "node-1", "node-2"),
  buildEdge("edge-2", "node-2", "node-3"),
  buildEdge("edge-3", "node-3", "node-1"),
];

type GraphCache = {
  checksum: string;
  graphData: GraphElement[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
async function getChecksum(content: string): Promise<string> {
  const bufferedGraphContent = encoder.encode(content);
  const graphHashBuffer = await window.crypto.subtle.digest(
    "SHA-256",
    bufferedGraphContent,
  );
  return decoder.decode(graphHashBuffer);
}

type CytoscapeGraphBuilder = (opts: CytoscapeOptions) => Core;
export type RenderWindow = Window & {
  cytoscape?: CytoscapeGraphBuilder;
  graph?: Core;
};
let stylesheet = [
  {
    selector: "edge",
    style: {
      width: "1px",
      "background-color": "#000",
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
    },
  },
];
function updateRenderedGraph(graphContent: GraphElement[]) {
  const _window = window as RenderWindow;
  if (_window.cytoscape != null) {
    _window.graph = _window.cytoscape({
      container: document.getElementById("graph-canvas") as HTMLDivElement,
      elements: graphContent,
      style: stylesheet,
    });
  }
}

export async function setupGraphEntryListener(textArea: HTMLTextAreaElement) {
  let graphContent: GraphCache = {
    checksum: await getChecksum(JSON.stringify(DEFAULT_GRAPH_CONTENT)),
    graphData: DEFAULT_GRAPH_CONTENT,
  };

  fetch("https://d3flxncytuj99u.cloudfront.net/graph-styles/default.json")
    .then((response) => response.json())
    .then((stylesheetPayload) => {
      stylesheet = stylesheetPayload;
    })
    .catch((err) => {
      console.error("Failed to load stylesheet", err.message);
    });

  // seed graph
  updateRenderedGraph(graphContent.graphData);

  textArea.addEventListener("input", async () => {
    const currentContent = textArea.value.trim();
    try {
      const parsedGraphData = JSON.parse(currentContent);
      const newGraphChecksum = await getChecksum(
        JSON.stringify(parsedGraphData),
      );
      if (graphContent.checksum !== newGraphChecksum) {
        graphContent = {
          checksum: newGraphChecksum,
          graphData: parsedGraphData,
        };
        updateRenderedGraph(graphContent.graphData);
      }
    } catch (err) {
      console.error("Failed to parse input as JSON: ", (err as Error).message);
    }
  });
}
