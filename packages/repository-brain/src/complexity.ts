import fs from "node:fs/promises";

import type { RepositorySnapshot } from "./types.js";


export interface FileComplexity {
  file: string;
  lines: number;
  functions: number;
  imports: number;
  complexityScore: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
}


export async function analyzeComplexity(
  snapshot: RepositorySnapshot
): Promise<FileComplexity[]> {

  const results: FileComplexity[] = [];


  for (const file of snapshot.files) {

    if (![".ts", ".tsx", ".js", ".jsx"].includes(file.extension)) {
      continue;
    }


    try {

      const source = await fs.readFile(
        file.absolutePath,
        "utf8"
      );


      const lines =
        source.split("\n").length;


      const functions =
        (
          source.match(
            /function\s+\w+|const\s+\w+\s*=\s*\(|=>/g
          ) ?? []
        ).length;


      const imports =
        (
          source.match(
            /import\s+/g
          ) ?? []
        ).length;


      const complexityScore =
        Math.min(
          100,
          lines * 0.1 +
          functions * 5 +
          imports * 2
        );


      let risk: FileComplexity["risk"];


      if (complexityScore > 70) {
        risk = "HIGH";
      } 
      else if (complexityScore > 35) {
        risk = "MEDIUM";
      }
      else {
        risk = "LOW";
      }


      results.push({
        file: file.path,
        lines,
        functions,
        imports,
        complexityScore: Math.round(complexityScore),
        risk,
      });


    } catch {
      continue;
    }

  }


  return results;
}