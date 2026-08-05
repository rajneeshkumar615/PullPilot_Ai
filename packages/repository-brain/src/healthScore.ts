import type { RepositoryReport } from "./report.js";

export interface HealthScore {
  architecture: number;
  maintainability: number;
  security: number;
  scalability: number;
  documentation: number;
  testing: number;
  overall: number;
}

export function calculateHealth(
  report: RepositoryReport
): HealthScore {
  const architecture =
    report.intelligence.architecture;

  const maintainability =
    report.intelligence.maintainability;

  const scalability =
    report.intelligence.scalability;

  const security =
    report.cycles.length === 0 ? 95 : 70;

  const documentation = 70;

  const testing = 60;

  const overall = Math.round(
    (
      architecture +
      maintainability +
      scalability +
      security +
      documentation +
      testing
    ) / 6
  );

  return {
    architecture,
    maintainability,
    scalability,
    security,
    documentation,
    testing,
    overall,
  };
}