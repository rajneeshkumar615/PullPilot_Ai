import type { RepositoryReport } from "./report.js";

export interface Insight {
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
}

export function buildInsights(
  report: RepositoryReport
): Insight[] {

  const insights: Insight[] = [];

  if (report.cycles.length > 0) {
    insights.push({
      title: "Circular Dependencies",
      severity: "HIGH",
      description:
        "Repository contains dependency cycles."
    });
  }

  if (report.complexity.highRisk > 0) {
    insights.push({
      title: "High Complexity",
      severity: "HIGH",
      description:
        `${report.complexity.highRisk} files are high risk.`
    });
  }

  if (report.dependencies.external > 50) {
    insights.push({
      title: "Dependency Count",
      severity: "MEDIUM",
      description:
        "Large number of external dependencies."
    });
  }

  if (report.git.contributors <= 1) {
    insights.push({
      title: "Bus Factor",
      severity: "HIGH",
      description:
        "Single contributor detected."
    });
  }

  return insights;
}