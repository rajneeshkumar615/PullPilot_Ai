export interface RepositoryIntelligence {
  overallScore: number;

  maintainability: number;

  scalability: number;

  architecture: number;

  dependencyHealth: number;

  codeQuality: number;

  summary: string;
}

export interface IntelligenceInput {
  architecture: {
    framework: unknown[];
    structure: unknown[];
  };

  dependencies: {
    total: number;
    external: number;
  };

  complexity: {
    highRisk: number;
  };

  cycles: unknown[];
}

export function analyzeRepositoryIntelligence(
  report: IntelligenceInput
): RepositoryIntelligence {
  let maintainability = 100;

  maintainability -= report.complexity.highRisk * 10;

  maintainability -= report.cycles.length * 5;

  maintainability = Math.max(0, maintainability);

  let dependencyHealth = 100;

  if (report.dependencies.total > 0) {
    dependencyHealth -= Math.round(
      (report.dependencies.external /
        report.dependencies.total) *
        30
    );
  }

  dependencyHealth = Math.max(0, dependencyHealth);

  let architecture = 50;

  architecture += report.architecture.framework.length * 10;

  architecture += report.architecture.structure.length * 20;

  architecture = Math.min(100, architecture);

  const scalability = Math.round(
    (architecture + dependencyHealth) / 2
  );

  const codeQuality = Math.round(
    (maintainability + architecture) / 2
  );

  const overallScore = Math.round(
    (
      maintainability +
      scalability +
      architecture +
      dependencyHealth +
      codeQuality
    ) / 5
  );

  return {
    overallScore,

    maintainability,

    scalability,

    architecture,

    dependencyHealth,

    codeQuality,

    summary:
      overallScore >= 90
        ? "Excellent engineering quality."
        : overallScore >= 75
        ? "Healthy repository with minor improvements."
        : overallScore >= 60
        ? "Moderate technical debt detected."
        : "Repository requires significant improvements.",
  };
}