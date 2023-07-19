import type {
  GraphEdge,
  GraphElement,
  GraphNode,
} from "@infrascan/shared-types";

function buildNode(id: string): GraphNode {
  return {
    id,
    group: "nodes",
    data: { id, type: "node" },
  };
}

function buildEdge(id: string, source: string, target: string): GraphEdge {
  return {
    group: "edges",
    data: { id, name: id, source, target, type: "edge" },
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
    bufferedGraphContent
  );
  return decoder.decode(graphHashBuffer);
}

type CytoscapeGraphOptions = {
  container: HTMLDivElement;
  elements: GraphElement[];
  style?: any[];
  layout?: {
    name: string;
  };
};
type CytoscapeGraphBuilder = (opts: CytoscapeGraphOptions) => void;
type RenderWindow = Window & { cytoscape?: CytoscapeGraphBuilder };
function updateRenderedGraph(graphContent: GraphElement[]) {
  const _window = window as RenderWindow;
  if (_window.cytoscape != null) {
    _window.cytoscape({
      container: document.getElementById("graph-canvas") as HTMLDivElement,
      elements: graphContent,
      style: [
        {
          selector: "edge",
          style: {
            width: "1px",
            "background-color": "#000",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
          },
        },
      ],
    });
  }
}

export async function setupGraphEntryListener(textArea: HTMLTextAreaElement) {
  let graphContent: GraphCache = {
    checksum: await getChecksum(JSON.stringify(DEFAULT_GRAPH_CONTENT)),
    graphData: DEFAULT_GRAPH_CONTENT,
  };
  // seed graph
  updateRenderedGraph(graphContent.graphData);

  textArea.addEventListener("input", async () => {
    const currentContent = textArea.value.trim();
    try {
      const parsedGraphData = JSON.parse(currentContent);
      const newGraphChecksum = await getChecksum(
        JSON.stringify(parsedGraphData)
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
