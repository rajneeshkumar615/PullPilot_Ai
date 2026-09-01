import type { PullRequest } from "./pr.js";

export type PRRiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface PRRisk {
  score: number;
  level: PRRiskLevel;
  reasons: string[];
}

export function calculatePRRisk(
  pr: PullRequest
): PRRisk {
  let score = 0;
  const reasons: string[] = [];

  if (pr.changedFiles >= 10) {
    score += 20;
    reasons.push("Large number of changed files.");
  } else if (pr.changedFiles >= 5) {
    score += 10;
    reasons.push("Moderate number of changed files.");
  }

  const totalChanges =
    pr.additions + pr.deletions;

  if (totalChanges >= 500) {
    score += 30;
    reasons.push("Very large change set.");
  } else if (totalChanges >= 200) {
    score += 20;
    reasons.push("Large change set.");
  } else if (totalChanges >= 100) {
    score += 10;
    reasons.push("Moderate change set.");
  }

  for (const file of pr.files) {
    const path = file.path.toLowerCase();

    if (
      path.includes("auth") ||
      path.includes("security") ||
      path.includes("permission")
    ) {
      score += 15;
      reasons.push(
        `Security-sensitive file changed: ${file.path}`
      );
    }

    if (
      path.includes("schema") ||
      path.includes("migration") ||
      path.includes("prisma")
    ) {
      score += 15;
      reasons.push(
        `Database-related file changed: ${file.path}`
      );
    }

    if (
      path.includes("package.json") ||
      path.includes("pnpm-lock") ||
      path.includes("package-lock")
    ) {
      score += 10;
      reasons.push(
        `Dependency configuration changed: ${file.path}`
      );
    }

    if (
      path.includes("config") ||
      path.includes(".env")
    ) {
      score += 10;
      reasons.push(
        `Configuration file changed: ${file.path}`
      );
    }
  }

  score = Math.min(score, 100);

  let level: PRRiskLevel;

  if (score >= 75) {
    level = "CRITICAL";
  } else if (score >= 50) {
    level = "HIGH";
  } else if (score >= 25) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return {
    score,
    level,
    reasons: [...new Set(reasons)],
  };
}