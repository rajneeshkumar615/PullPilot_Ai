import type { RepositoryReport } from "./report.js";

export interface RepositoryMetrics {
  codebaseSize: number;
  averageLinesPerFile: number;
  dependencyDensity: number;
  contributorCount: number;
}

export function buildMetrics(
  report: RepositoryReport
): RepositoryMetrics {
  return {
    codebaseSize: report.summary.totalLines,

    averageLinesPerFile: Math.round(
      report.summary.totalLines /
      report.summary.totalFiles
    ),

    dependencyDensity: Number(
      (
        report.dependencies.total /
        report.summary.totalFiles
      ).toFixed(2)
    ),

    contributorCount: report.git.contributors,
  };
}