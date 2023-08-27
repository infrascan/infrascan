import './style.css';
import { setupGraphEntryListener, DEFAULT_GRAPH_CONTENT } from './graph.ts';
import { Edit, Information, ExternalLink } from './icons.ts';
import {
  setupEditIconInteraction,
  setupInfoIconInteraction,
  setupLinkInteraction,
} from './interactions.ts';

const NODES: Record<string, string> = {
  GraphInput: 'graph-input',
  GraphCanvas: 'graph-canvas',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="island" id="island">
    <div class="icons-container">
      ${Edit('edit-icon')}
      ${Information('info-icon')}
      ${ExternalLink('link-icon')}
    </div>
    <div class="info-content">
      <p>Infrascan is an open source toolkit which scans your AWS infrastructure and auto-generates system diagrams.</p>
      <div>
        <p>
          <a href="https://github.com/infrascan/infrascan">GitHub</a>
           // 
          <a href="https://infrascan.io">Infrascan.io</a>
        </p>
      </div>
    </div>
  </div>
  <div class="side-drawer" id="graph-side-drawer">
    <textarea id="${NODES.GraphInput}">${JSON.stringify(
  DEFAULT_GRAPH_CONTENT,
  undefined,
  2,
)}</textarea>
  </div>
  <div id="${NODES.GraphCanvas}"></div>
  <div id="powered-by">
    <img src="/logo.svg" alt="Infrascan.io logo" />
    <div>
      <p>Powered By:</p>
      <h5>Infrascan.io</h5>
    </div>
  </div>
`;

setupGraphEntryListener(
  document.querySelector<HTMLTextAreaElement>(`#${NODES.GraphInput}`)!,
);
setupEditIconInteraction('edit-icon', 'graph-side-drawer', 'island');
setupInfoIconInteraction('info-icon', 'island');
setupLinkInteraction('link-icon', 'https://infrascan.io');
setupLinkInteraction('powered-by', 'https://infrascan.io');
