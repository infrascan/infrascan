import "./style.css";
import { setupGraphEntryListener, DEFAULT_GRAPH_CONTENT } from "./graph.ts";
import { Edit, ExternalLink, Information } from "./icons.ts";
import {
  setupEditIconInteraction,
  setupInfoIconInteraction,
  setupLinkInteraction,
} from "./interactions.ts";

const NODES: Record<string, string> = {
  GraphInput: "graph-input",
  GraphCanvas: "graph-canvas",
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="island" id="island">
    <div class="icons-container">
      ${Edit("edit-icon", false)}
      ${Information("info-icon")}
      ${ExternalLink("link-icon")}
    </div>
  </div>
  <div class="side-drawer" id="graph-side-drawer">
    <textarea id="${NODES.GraphInput}">${JSON.stringify(
  DEFAULT_GRAPH_CONTENT,
  undefined,
  2
)}</textarea>
  </div>
  <div id="${NODES.GraphCanvas}"></div>
`;

setupGraphEntryListener(
  document.querySelector<HTMLTextAreaElement>(`#${NODES.GraphInput}`)!
);
setupEditIconInteraction("edit-icon", "graph-side-drawer", "island");
setupInfoIconInteraction("info-icon", "island");
setupLinkInteraction("link-icon", "https://infrascan.io");
