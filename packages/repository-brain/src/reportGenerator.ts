import type { RepositorySnapshot } from "./types.js";

import { buildStatistics } from "./statistics.js";
import { buildDependencyGraph } from "./dependencyGraph.js";
import { resolveDependencies } from "./resolver.js";
import { detectCycles } from "./cycleDetector.js";
import { analyzeComplexity } from "./complexity.js";
import { analyzeArchitecture } from "./architecture.js";
import { buildSymbolIndex } from "./symbolIndex.js";
import { analyzeRepositoryIntelligence } from "./intelligence.js";
import { analyzeGitRepository } from "./gitAnalyzer.js";

export interface RepositoryReport {
  generatedAt: string;

  summary: {
    totalFiles: number;
    totalLines: number;
    languages: unknown;
  };

  architecture: unknown;

  dependencies: {
    total: number;
    external: number;
    internal: number;
  };

  cycles: unknown;

  complexity: {
    files: number;
    highRisk: number;
  };

  symbols: number;

  git: {
    totalCommits: number;
    contributors: number;
    recentCommits: {
      hash: string;
      author: string;
      message: string;
      date: string;
    }[];
  };

  intelligence: {
    overallScore: number;
    maintainability: number;
    scalability: number;
    architecture: number;
    dependencyHealth: number;
    codeQuality: number;
    summary: string;
  };
}

export async function generateRepositoryReport(
  snapshot: RepositorySnapshot
): Promise<RepositoryReport> {
  const stats = await buildStatistics(snapshot);

  const graph = await buildDependencyGraph(snapshot);

  const resolved = resolveDependencies(snapshot, graph);

  const cycles = detectCycles(resolved);

  const complexity = await analyzeComplexity(snapshot);

  const architecture = await analyzeArchitecture(snapshot);

  const symbols = await buildSymbolIndex(snapshot);

  const git = await analyzeGitRepository(snapshot.root);

  const intelligence = analyzeRepositoryIntelligence({
    architecture,
    dependencies: {
      total: resolved.length,
      external: resolved.filter((d) => d.external).length,
    },
    complexity: {
      highRisk: complexity.filter((c) => c.risk === "HIGH").length,
    },
    cycles,
  });

  return {
    generatedAt: new Date().toISOString(),

    summary: {
      totalFiles: stats.totalFiles,
      totalLines: stats.totalLines,
      languages: stats.languages,
    },

    architecture,

    dependencies: {
      total: resolved.length,
      external: resolved.filter((d) => d.external).length,
      internal: resolved.filter((d) => !d.external).length,
    },

    cycles,

    complexity: {
      files: complexity.length,
      highRisk: complexity.filter((c) => c.risk === "HIGH").length,
    },

    symbols: symbols.length,

    git: {
      totalCommits: git.totalCommits,
      contributors: git.contributors,
      recentCommits: git.recentCommits,
    },

    intelligence,
  };
}