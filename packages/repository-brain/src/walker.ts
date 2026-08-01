import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

import type { RepositoryFile } from "./types.js";

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.vercel/**",
  "**/.cache/**",
  "**/*.log",
];

export async function walkRepository(
  repositoryPath: string
): Promise<RepositoryFile[]> {
  const files = await fg("**/*", {
    cwd: repositoryPath,
    onlyFiles: true,
    absolute: true,
    ignore: DEFAULT_IGNORE,
  });

  return Promise.all(
    files.map(async (absolutePath) => {
      const stat = await fs.stat(absolutePath);

      return {
        absolutePath,
        path: path.relative(repositoryPath, absolutePath),
        extension: path.extname(absolutePath),
        size: stat.size,
      };
    })
  );
}