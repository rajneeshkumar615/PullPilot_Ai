import fs from "node:fs/promises";

import type { RepositorySnapshot } from "./types.js";

export interface DependencyNode {
  file: string;
  imports: string[];
}

export async function buildDependencyGraph(
  snapshot: RepositorySnapshot
): Promise<DependencyNode[]> {
  const graph: DependencyNode[] = [];

  const IMPORT_REGEX =
    /import\s+(?:[\s\S]+?)\s+from\s+["'](.+?)["']/g;

  for (const file of snapshot.files) {
    if (![".ts", ".tsx", ".js", ".jsx"].includes(file.extension)) {
      continue;
    }

    try {
      const source = await fs.readFile(file.absolutePath, "utf8");

      const imports: string[] = [];

      let match: RegExpExecArray | null;

      while ((match = IMPORT_REGEX.exec(source)) !== null) {
        const importedModule = match[1];

if (importedModule) {
  imports.push(importedModule);
}
      }

      graph.push({
        file: file.path,
        imports,
      });
    } catch {
      // ignore unreadable files
    }
  }

  return graph;
}