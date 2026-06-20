// Entry for the slim MappAI graphology bundle.
// Bundled once via esbuild → public/js/vendor/mappai-graphology.min.js (committed, no runtime bundler).
// Exposes only the 4 pieces the structure analyzer needs, keeping the footprint minimal
// (avoids the full graphology-library which pulls in GEXF/GraphML/SVG/canvas + DOMParser).
import Graph from 'graphology';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { countConnectedComponents } from 'graphology-components';
import louvain from 'graphology-communities-louvain';

export { Graph, betweennessCentrality, countConnectedComponents, louvain };
