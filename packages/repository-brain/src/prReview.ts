import { OpenRouterProvider } from "./providers/openrouter.js";
import type { PullRequest } from "./pr.js";
import type { PRRisk } from "./prRisk.js";

const provider = new OpenRouterProvider();

export async function reviewPullRequest(
  pr: PullRequest,
  risk: PRRisk
) {
  const diff = pr.files
    .map((file) => {
      return [
        `FILE: ${file.path}`,
        `STATUS: ${file.status}`,
        `ADDITIONS: ${file.additions}`,
        `DELETIONS: ${file.deletions}`,
        "PATCH:",
        file.patch ?? "No patch available",
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const prompt = `
You are a Staff Software Engineer performing a production Pull Request review.

Return ONLY valid JSON.

Review the following Pull Request.

PR:
Number: ${pr.number}
Title: ${pr.title}
Description: ${pr.description ?? "None"}
Author: ${pr.author}

Base: ${pr.baseBranch}
Head: ${pr.headBranch}

Repository change metrics:
Files: ${pr.changedFiles}
Additions: ${pr.additions}
Deletions: ${pr.deletions}

Deterministic risk:
Score: ${risk.score}
Level: ${risk.level}
Reasons:
${risk.reasons.join("\n")}

DIFF:
${diff}

Return exactly this shape:

{
  "summary": "string",
  "recommendation": "APPROVE | REQUEST_CHANGES | COMMENT",
  "findings": [
    {
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "category": "BUG | SECURITY | PERFORMANCE | ARCHITECTURE | CODE_QUALITY | TESTING",
      "file": "string",
      "problem": "string",
      "why": "string",
      "suggestion": "string"
    }
  ],
  "testing": [
    "string"
  ]
}

Only report real issues supported by the diff.
Do not invent files, lines, vulnerabilities, or behavior.
`;

  const response = await provider.analyze(prompt);

  return response;
}