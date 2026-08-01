import type { ArchitectureReport } from "./architecture.js";
import type { FileComplexity } from "./complexity.js";
import type { DependencyCycle } from "./cycleDetector.js";
import type { RepositoryStats } from "./types.js";

export interface RepositoryScore {
  overall: number;
  architecture: number;
  complexity: number;
  maintainability: number;
  dependencies: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateRepositoryScore(params: {
  stats: RepositoryStats;
  architecture: ArchitectureReport;
  complexity: FileComplexity[];
  cycles: DependencyCycle[];
}): RepositoryScore {
  const { stats, architecture, complexity, cycles } = params;

  // -----------------------------
  // Architecture
  // -----------------------------

  let architectureScore = 50;

  if (architecture.framework.length) architectureScore += 15;
  if (architecture.language.includes("TypeScript")) architectureScore += 15;
  if (architecture.packageManager.length) architectureScore += 5;
  if (architecture.structure.length) architectureScore += 10;
  if (architecture.deployment.length) architectureScore += 5;

  architectureScore = clamp(architectureScore);

  // -----------------------------
  // Complexity
  // -----------------------------

  const highRisk = complexity.filter(f => f.risk === "HIGH").length;
  const mediumRisk = complexity.filter(f => f.risk === "MEDIUM").length;

  let complexityScore =
    100 -
    highRisk * 15 -
    mediumRisk * 5;

  complexityScore = clamp(complexityScore);

  // -----------------------------
  // Dependencies
  // -----------------------------

  let dependencyScore = 100;

  dependencyScore -= cycles.length * 20;

  dependencyScore = clamp(dependencyScore);

  // -----------------------------
  // Maintainability
  // -----------------------------

  let maintainability = 100;

  if (stats.totalFiles > 300)
    maintainability -= 10;

  if (stats.totalLines > 50000)
    maintainability -= 10;

  maintainability -= highRisk * 10;

  maintainability = clamp(maintainability);

  // -----------------------------
  // Overall
  // -----------------------------

  const overall = clamp(
    architectureScore * 0.30 +
      complexityScore * 0.30 +
      dependencyScore * 0.20 +
      maintainability * 0.20
  );

  return {
    overall,
    architecture: architectureScore,
    complexity: complexityScore,
    maintainability,
    dependencies: dependencyScore,
  };
}