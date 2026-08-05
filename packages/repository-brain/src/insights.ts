import type { RepositoryReport } from "./report.js";

export interface RepositoryInsight {
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
}

export function generateInsights(
  report: RepositoryReport
): RepositoryInsight[] {
  const insights: RepositoryInsight[] = [];

  if (report.complexity.highRisk > 0) {
    insights.push({
      title: "High Complexity",
      severity: "HIGH",
      description: `${report.complexity.highRisk} files are high risk.`,
    });
  }

  if (report.cycles.length > 0) {
    insights.push({
      title: "Circular Dependencies",
      severity: "HIGH",
      description: `${report.cycles.length} dependency cycles detected.`,
    });
  }

  if (report.dependencies.external > 50) {
    insights.push({
      title: "Large Dependency Graph",
      severity: "MEDIUM",
      description: "Large number of external dependencies.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Healthy Repository",
      severity: "LOW",
      description: "No major architectural issues detected.",
    });
  }

  return insights;
}