import type { ResolvedDependency } from "./resolver.js";

export interface DependencyCycle {
  cycle: string[];
}


export function detectCycles(
  dependencies: ResolvedDependency[]
): DependencyCycle[] {

  const graph = new Map<string, string[]>();


  for (const dependency of dependencies) {

    if (dependency.external) {
      continue;
    }

    if (!graph.has(dependency.from)) {
      graph.set(dependency.from, []);
    }

    graph.get(dependency.from)!.push(dependency.to);
  }


  const cycles: DependencyCycle[] = [];

  const visited = new Set<string>();
  const stack = new Set<string>();

  const path: string[] = [];


  function dfs(node: string) {

    if (stack.has(node)) {

      const index = path.indexOf(node);

      if (index !== -1) {
        cycles.push({
          cycle: [
            ...path.slice(index),
            node
          ]
        });
      }

      return;
    }


    if (visited.has(node)) {
      return;
    }


    visited.add(node);
    stack.add(node);
    path.push(node);


    const children = graph.get(node) ?? [];


    for (const child of children) {
      dfs(child);
    }


    path.pop();
    stack.delete(node);
  }


  for (const node of graph.keys()) {
    dfs(node);
  }


  return cycles;
}