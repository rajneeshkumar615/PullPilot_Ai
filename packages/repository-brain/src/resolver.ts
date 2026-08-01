import path from "node:path";

import type { RepositorySnapshot } from "./types.js";
import type { DependencyNode } from "./dependencyGraph.js";

export interface ResolvedDependency {
  from: string;
  to: string;
  external: boolean;
}

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
];

export function resolveDependencies(
  snapshot: RepositorySnapshot,
  graph: DependencyNode[]
): ResolvedDependency[] {
  const repositoryFiles = new Set(
    snapshot.files.map((file) => file.path.replace(/\\/g, "/"))
  );

  const resolved: ResolvedDependency[] = [];

  for (const node of graph) {
    const from = node.file.replace(/\\/g, "/");

    for (const imported of node.imports) {
      // npm package
      if (
        !imported.startsWith("./") &&
        !imported.startsWith("../")
      ) {
        resolved.push({
          from,
          to: imported,
          external: true,
        });

        continue;
      }

      const directory = path.posix.dirname(from);

      const base = path.posix.normalize(
        path.posix.join(directory, imported)
      );

      let target: string | undefined;

      for (const ext of EXTENSIONS) {
        if (repositoryFiles.has(base + ext)) {
          target = base + ext;
          break;
        }
      }

      if (!target) {
        for (const ext of EXTENSIONS) {
          if (repositoryFiles.has(base + "/index" + ext)) {
            target = base + "/index" + ext;
            break;
          }
        }
      }

      resolved.push({
        from,
        to: target ?? imported,
        external: false,
      });
    }
  }

  return resolved;
}