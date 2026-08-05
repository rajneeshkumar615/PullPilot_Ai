import type { RepositorySnapshot } from "./types.js";

export interface GraphNode {
  id: string;
  type: "file";
  path: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: "imports";
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildKnowledgeGraph(
  snapshot: RepositorySnapshot
): KnowledgeGraph {

  const nodes: GraphNode[] = [];

  for (const file of snapshot.files) {
    nodes.push({
      id: file.path,
      type: "file",
      path: file.path,
    });
  }

  return {
    nodes,
    edges: [],
  };
}