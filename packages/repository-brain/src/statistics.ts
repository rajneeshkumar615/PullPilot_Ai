import fs from "node:fs/promises";

import type {
  RepositorySnapshot,
  RepositoryStats,
} from "./types.js";

export async function buildStatistics(
  snapshot: RepositorySnapshot
): Promise<RepositoryStats> {
  let totalLines = 0;

  const languageMap = new Map<string, number>();

  for (const file of snapshot.files) {
    try {
      const content = await fs.readFile(file.absolutePath, "utf8");

      totalLines += content.split("\n").length;
    } catch {
      // Ignore binary/unreadable files
    }

    languageMap.set(
      file.extension || "unknown",
      (languageMap.get(file.extension || "unknown") ?? 0) + 1
    );
  }

  return {
    totalFiles: snapshot.files.length,
    totalLines,
    languages: [...languageMap.entries()].map(([language, files]) => ({
      language,
      files,
    })),
  };
}