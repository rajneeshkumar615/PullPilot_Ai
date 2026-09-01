import {
  getPullRequest,
  getRepositoryFile,
  createBranch,
  createCommitWithFiles,
  deleteRepositoryFile,
  createPullRequest,
  checkPullRequestMergeability,
} from "./githubClient.js";

import { OpenRouterProvider } from "./providers/openrouter.js";
import { verifyPRBranch } from "./prVerification.js";

export interface PRAnalysis {
  summary: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  bugs: string[];
  security: string[];
  performance: string[];
  maintainability: string[];
  recommendations: string[];
}

export interface PRFix {
  summary: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  changes: Array<{
    path: string;
    explanation: string;
    before: string;
    after: string;
  }>;
  tests: string[];
  warnings: string[];
}

function buildPRPrompt(pr: any): string {
  const files = pr.files
    .map(
      (file: any) => `
FILE: ${file.path}
STATUS: ${file.status}
ADDITIONS: ${file.additions}
DELETIONS: ${file.deletions}

PATCH:
${file.patch ?? "No patch available"}
`
    )
    .join("\n---\n");

  return `
Analyze this GitHub Pull Request as a Staff Software Engineer.

PR:
Title: ${pr.title}
Description: ${pr.description ?? "No description"}
Author: ${pr.author}

Base branch: ${pr.baseBranch}
Head branch: ${pr.headBranch}

Additions: ${pr.additions}
Deletions: ${pr.deletions}
Changed files: ${pr.changedFiles}

Changed files:
${files}

Return ONLY valid JSON using exactly this structure:

{
  "summary": "short engineering summary",
  "risk": "LOW",
  "score": 0,
  "bugs": [],
  "security": [],
  "performance": [],
  "maintainability": [],
  "recommendations": []
}

Rules:
- score must be between 0 and 100
- risk must be LOW, MEDIUM, or HIGH
- bugs must contain concrete potential bugs
- security must contain security concerns
- performance must contain performance concerns
- maintainability must contain maintainability concerns
- recommendations must contain actionable engineering recommendations
- Do not invent issues that are not supported by the patch.
`;
}

function parsePRAnalysis(response: string): PRAnalysis {
  try {
    const parsed = JSON.parse(response);

    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "No summary provided.",

      risk:
        parsed.risk === "HIGH" ||
        parsed.risk === "MEDIUM" ||
        parsed.risk === "LOW"
          ? parsed.risk
          : "MEDIUM",

      score:
        typeof parsed.score === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.score)))
          : 0,

      bugs: Array.isArray(parsed.bugs) ? parsed.bugs : [],
      security: Array.isArray(parsed.security)
        ? parsed.security
        : [],
      performance: Array.isArray(parsed.performance)
        ? parsed.performance
        : [],
      maintainability: Array.isArray(parsed.maintainability)
        ? parsed.maintainability
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
    };
  } catch {
    return {
      summary: "AI returned an invalid PR analysis response.",
      risk: "MEDIUM",
      score: 0,
      bugs: [],
      security: [],
      performance: [],
      maintainability: [],
      recommendations: [],
    };
  }
}

/* =========================================================
   PR ANALYSIS
========================================================= */

export async function analyzePullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<PRAnalysis> {
  const pr = await getPullRequest(owner, repo, number);

  const prompt = buildPRPrompt(pr);

  const provider = new OpenRouterProvider();

  const response = await provider.analyze(prompt);

  return parsePRAnalysis(response);
}

/* =========================================================
   AI FIX GENERATOR
========================================================= */

function buildFixPrompt(
  pr: any,
  finding: string,
  category: string,
  fileContents: Array<{
    path: string;
    content: string;
  }>
): string {
  const files = pr.files
    .map(
      (file: any) => `
==================================================
FILE: ${file.path}
STATUS: ${file.status}
ADDITIONS: ${file.additions}
DELETIONS: ${file.deletions}

PATCH:
${file.patch ?? "No patch available"}

ACTUAL PR HEAD CONTENT:
${
  fileContents.find(
    (item) => item.path === file.path
  )?.content ?? "Unable to fetch file content"
}
`
    )
    .join("\n");

  return `
You are PullPilot AI, an autonomous Staff Software Engineer.

You are reviewing a GitHub Pull Request.

Your job is NOT to rewrite the entire repository.

Your job is to propose the smallest safe code change that fixes
the specific engineering finding below.

PR:
Title: ${pr.title}
Base branch: ${pr.baseBranch}
Head branch: ${pr.headBranch}
Head SHA: ${pr.headSha}

FINDING CATEGORY:
${category}

FINDING:
${finding}

PR FILES:
${files}

IMPORTANT SAFETY RULES:

1. The ACTUAL PR HEAD CONTENT is the source of truth.
2. The "before" value MUST be copied EXACTLY from the ACTUAL PR HEAD CONTENT.
3. Do NOT reconstruct, normalize, reformat, or rewrite the "before" value.
4. Preserve whitespace, indentation, quotes, semicolons, and line breaks.
5. "before" must be an exact substring of the ACTUAL PR HEAD CONTENT.
6. Only modify files that are actually relevant.
7. Prefer the smallest possible change.
8. Do not rewrite unrelated code.
9. Do not invent files unless absolutely necessary.
10. Preserve the existing architecture.
11. Preserve existing behavior unless the finding requires changing it.
12. Never expose secrets.
13. Do not return markdown.
14. Return ONLY valid JSON.
15. The "after" value must contain the replacement code.
16. For file deletion:
    - "before" must contain the exact existing file content or exact content
      being validated by the deletion workflow.
    - "after" must be an empty string.
17. If the finding cannot safely be fixed from the ACTUAL PR HEAD CONTENT,
    return an empty changes array and explain why in warnings.

Return exactly:

{
  "summary": "short explanation of the proposed fix",
  "risk": "LOW",
  "changes": [
    {
      "path": "actual/file/path.js",
      "explanation": "why this change fixes the finding",
      "before": "EXACT code copied from ACTUAL PR HEAD CONTENT",
      "after": "replacement code"
    }
  ],
  "tests": [
    "test that should be run"
  ],
  "warnings": []
}

Risk must be LOW, MEDIUM, or HIGH.

Do not include markdown fences.
`;
}

function parsePRFix(response: string): PRFix {
  try {
    const parsed = JSON.parse(response);

    const validRisk =
      parsed.risk === "HIGH" ||
      parsed.risk === "MEDIUM" ||
      parsed.risk === "LOW"
        ? parsed.risk
        : "MEDIUM";

    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "No fix summary provided.",

      risk: validRisk,

      changes: Array.isArray(parsed.changes)
        ? parsed.changes
            .filter(
              (change: any) =>
                typeof change?.path === "string" &&
                typeof change?.before === "string" &&
                typeof change?.after === "string"
            )
            .map((change: any) => ({
              path: change.path,
              explanation:
                typeof change.explanation === "string"
                  ? change.explanation
                  : "Proposed code change.",
              before: change.before,
              after: change.after,
            }))
        : [],

      tests: Array.isArray(parsed.tests)
        ? parsed.tests.filter(
            (test: any) => typeof test === "string"
          )
        : [],

      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter(
            (warning: any) => typeof warning === "string"
          )
        : [],
    };
  } catch {
    return {
      summary: "AI returned an invalid fix response.",
      risk: "HIGH",
      changes: [],
      tests: [],
      warnings: [
        "The AI response could not be parsed safely.",
      ],
    };
  }
}

export async function generatePRFix(
  owner: string,
  repo: string,
  number: number,
  category: string,
  finding: string
): Promise<PRFix> {
  const pr = await getPullRequest(
    owner,
    repo,
    number
  );

  if (!pr.headSha) {
    throw new Error(
      "PR head SHA is missing."
    );
  }

  const fileContents: Array<{
    path: string;
    content: string;
  }> = [];

  for (const file of pr.files) {
    try {
      const repositoryFile =
        await getRepositoryFile(
          owner,
          repo,
          file.path,
          pr.headSha
        );

      fileContents.push({
        path: file.path,
        content: repositoryFile.content,
      });
    } catch (error) {
      console.warn(
        `PullPilot: unable to fetch ${file.path} from PR HEAD`,
        error
      );
    }
  }

  const prompt = buildFixPrompt(
    pr,
    finding,
    category,
    fileContents
  );

  const provider =
    new OpenRouterProvider();

  const response =
    await provider.analyze(prompt);

  console.log("========== RAW AI FIX RESPONSE ==========");
  console.log(response);
  console.log("=========================================");

  return parsePRFix(response);
}

/* =========================================================
   MERGEABILITY POLLING
========================================================= */

async function waitForMergeability(
  owner: string,
  repo: string,
  pullNumber: number,
  options: {
    attempts?: number;
    delayMs?: number;
  } = {}
) {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 2000;

  let lastResult:
    | Awaited<ReturnType<typeof checkPullRequestMergeability>>
    | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    lastResult = await checkPullRequestMergeability(
      owner,
      repo,
      pullNumber
    );

    console.log(
      `🔍 PullPilot: mergeability check ${attempt}/${attempts}`,
      lastResult
    );

    /*
     * GitHub has finished calculating mergeability.
     */
    if (
      lastResult.mergeable !== null &&
      lastResult.mergeableState !== "unknown"
    ) {
      return lastResult;
    }

    /*
     * GitHub is still calculating.
     */
    if (attempt < attempts) {
      console.log(
        `⏳ PullPilot: GitHub mergeability is still unknown. Retrying in ${delayMs}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  /*
   * GitHub never finished calculating mergeability.
   */
  return lastResult!;
}

/* =========================================================
   APPLY PR FIX
========================================================= */

export async function applyPRFix(
  owner: string,
  repo: string,
  number: number,
  fix: PRFix
) {
  /*
   * -------------------------------------------------------
   * 1. Validate the incoming fix
   * -------------------------------------------------------
   */

  if (!fix || typeof fix !== "object") {
    throw new Error("Invalid AI fix.");
  }

  if (!Array.isArray(fix.changes) || fix.changes.length === 0) {
    throw new Error("No AI-generated changes available.");
  }

  for (const change of fix.changes) {
    if (
      typeof change?.path !== "string" ||
      typeof change?.before !== "string" ||
      typeof change?.after !== "string"
    ) {
      throw new Error(
        "Every AI change requires path, before and after."
      );
    }

    if (!change.path.trim()) {
      throw new Error("AI fix contains an empty file path.");
    }

    if (!change.before.trim()) {
      throw new Error(
        `AI fix contains an empty "before" block for ${change.path}.`
      );
    }

    if (
      typeof change.after !== "string" ||
      typeof change.before !== "string"
    ) {
      throw new Error(
        `AI fix contains an invalid change for ${change.path}.`
      );
    }

    /*
     * An empty "after" is allowed and is treated as a
     * file-deletion request:
     *
     * before = existing code (must be present)
     * after  = "" → DELETE FILE
     */

    /*
     * Never allow the AI to use an absolute filesystem path.
     */
    if (
      change.path.startsWith("/") ||
      change.path.startsWith("\\") ||
      /^[A-Za-z]:[\\/]/.test(change.path)
    ) {
      throw new Error(
        `Unsafe file path rejected: ${change.path}`
      );
    }

    /*
     * Prevent path traversal.
     */
    const normalizedPath = change.path.replace(/\\/g, "/");

    if (
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      normalizedPath.includes("/../")
    ) {
      throw new Error(
        `Unsafe file path rejected: ${change.path}`
      );
    }
  }

  /*
   * -------------------------------------------------------
   * 2. Fetch the original PR
   * -------------------------------------------------------
   */

  const pr = await getPullRequest(
    owner,
    repo,
    number
  );

  if (!pr.headSha) {
    throw new Error(
      "PR head SHA is missing."
    );
  }

  if (!pr.baseBranch) {
    throw new Error(
      "PR base branch is missing."
    );
  }

  if (!pr.headBranch) {
    throw new Error(
      "PR head branch is missing."
    );
  }

  /*
   * -------------------------------------------------------
   * 3. Fetch and validate EVERY file BEFORE changing GitHub
   * -------------------------------------------------------
   *
   * This is extremely important.
   *
   * We do not create a branch or commit anything until
   * every AI-generated change passes validation.
   *
   * Changes with an empty "after" are treated as deletions
   * and are validated/tracked separately from content
   * modifications.
   * -------------------------------------------------------
   */

  const validatedChanges: Array<{
    path: string;
    explanation: string;
    before: string;
    after: string;
    content: string;
    sha: string;
  }> = [];

  const validatedDeletions: Array<{
    path: string;
    explanation: string;
    sha: string;
  }> = [];

  for (const change of fix.changes) {
    const file = await getRepositoryFile(
      owner,
      repo,
      change.path,
      pr.headSha
    );

    /*
     * Exact BEFORE code must exist.
     */
    if (!file.content.includes(change.before)) {
      throw new Error(
        `Safety check failed for ${change.path}: expected code was not found in the PR head.`
      );
    }

    /*
     * Exact BEFORE code must appear exactly once.
     *
     * This prevents PullPilot from accidentally replacing
     * multiple identical blocks.
     */
    const occurrences =
      file.content.split(change.before).length - 1;

    if (occurrences !== 1) {
      throw new Error(
        `Safety check failed for ${change.path}: expected code occurs ${occurrences} times.`
      );
    }

    if (change.after === "") {
      /*
       * Deletion request — nothing more to validate here.
       */
      validatedDeletions.push({
        path: change.path,
        explanation: change.explanation,
        sha: file.sha,
      });
      continue;
    }

    const updatedContent =
      file.content.replace(
        change.before,
        change.after
      );

    if (updatedContent === file.content) {
      throw new Error(
        `Safety check failed for ${change.path}: file content was not changed.`
      );
    }

    validatedChanges.push({
      path: change.path,
      explanation: change.explanation,
      before: change.before,
      after: change.after,
      content: updatedContent,
      sha: file.sha,
    });
  }

  /*
   * -------------------------------------------------------
   * 4. Create a unique fix branch
   * -------------------------------------------------------
   *
   * IMPORTANT:
   * The branch starts from the PR HEAD, not the base branch.
   *
   * We are fixing the code introduced by the PR.
   * -------------------------------------------------------
   */

  const branchName =
    `pullpilot/fix-pr-${number}-${Date.now()}`;

  const branch = await createBranch(
    owner,
    repo,
    branchName,
    pr.headSha
  );

  /*
   * -------------------------------------------------------
   * 5. Apply validated changes
   * -------------------------------------------------------
   *
   * Deletions are applied individually (one commit each),
   * since createCommitWithFiles only handles content
   * updates, not removals. Modifications are still applied
   * together as a single atomic commit.
   * -------------------------------------------------------
   */

  const deletionCommits: Array<{
    path: string;
    commitSha: string;
  }> = [];

  for (const deletion of validatedDeletions) {
    const deleteResult = await deleteRepositoryFile(
      owner,
      repo,
      branchName,
      deletion.path,
      deletion.sha,
      `fix: delete ${deletion.path} per PullPilot AI fix for PR #${number}`
    );

    deletionCommits.push({
      path: deletion.path,
      commitSha: deleteResult.commitSha,
    });
  }

  let commitResult:
    | { commitSha: string }
    | undefined;

  if (validatedChanges.length > 0) {
    commitResult = await createCommitWithFiles(
      owner,
      repo,
      branchName,
      pr.headSha,
      validatedChanges.map((change) => ({
        path: change.path,
        content: change.content,
      })),
      `fix: apply PullPilot AI fix for PR #${number}`
    );
  }

  /* =========================================================
     6. VERIFY FIX BRANCH
  ========================================================= */

  console.log(
    `🧪 PullPilot: verifying fix branch ${branchName}`
  );

  const verification = await verifyPRBranch(
    owner,
    repo,
    branchName
  );

  const allChangesApplied = [
    ...validatedChanges.map((change) => ({
      path: change.path,
      explanation: change.explanation,
    })),
    ...validatedDeletions.map((deletion) => ({
      path: deletion.path,
      explanation: deletion.explanation,
    })),
  ];

  const allCommits = [
    ...(commitResult
      ? validatedChanges.map((change) => ({
          path: change.path,
          commitSha: commitResult!.commitSha,
        }))
      : []),
    ...deletionCommits,
  ];

  if (!verification.success) {
    return {
      success: false,

      originalPR: number,

      sourceBranch: pr.headBranch,

      fixBranch: branchName,

      commits: allCommits,

      changesApplied: allChangesApplied,

      verification,

      pullRequest: undefined,

      warnings: [
        "PullPilot generated and committed the fix, but verification failed.",
        "The fix branch was NOT opened as a Pull Request.",
      ],
    };
  }

  /*
   * -------------------------------------------------------
   * 7. Create reviewable GitHub PR
   * -------------------------------------------------------
   */

  const fixPR = await createPullRequest(
    owner,
    repo,
    `fix: PullPilot AI fix for PR #${number}`,
    [
      `## PullPilot AI Fix`,
      "",
      `Automatically generated fix for PR #${number}.`,
      "",
      `### Summary`,
      fix.summary,
      "",
      `### Risk`,
      fix.risk,
      "",
      `### Changes`,
      ...validatedChanges.map(
        (change) =>
          `- \`${change.path}\` — ${change.explanation}`
      ),
      ...validatedDeletions.map(
        (deletion) =>
          `- \`${deletion.path}\` — deleted — ${deletion.explanation}`
      ),
      "",
      `### Tests`,
      ...(fix.tests.length > 0
        ? fix.tests.map(
            (test) => `- ${test}`
          )
        : ["- No tests specified by AI."]),
      "",
      `### Warnings`,
      ...(fix.warnings.length > 0
        ? fix.warnings.map(
            (warning) => `- ${warning}`
          )
        : ["- None"]),
      "",
      `### PullPilot Safety Checks`,
      `- Exact BEFORE code verified`,
      `- Every target file verified before modification`,
      `- Changes applied from PR HEAD`,
      `- No unrelated files modified`,
      "",
      `Generated by PullPilot AI.`,
    ].join("\n"),
    branchName,
    pr.baseBranch
  );

  /* =========================================================
     8. CHECK GITHUB MERGEABILITY
  ========================================================= */

  console.log(
    `🔍 PullPilot: checking mergeability of PR #${fixPR.number}`
  );

  const mergeability =
    await waitForMergeability(
      owner,
      repo,
      fixPR.number
    );

  console.log(
    "PullPilot mergeability:",
    mergeability
  );

  if (
    mergeability.mergeable === false ||
    mergeability.mergeableState === "dirty" ||
    mergeability.mergeableState === "conflicting"
  ) {
    return {
      success: false,

      originalPR: number,

      sourceBranch: pr.headBranch,

      fixBranch: branchName,

      commits: allCommits,

      changesApplied: allChangesApplied,

      verification,

      pullRequest: fixPR,

      mergeability,

      warnings: [
        "PullPilot generated and verified the fix, but GitHub reports that the fix PR has merge conflicts.",
        "The generated fix PR was not marked as safely mergeable.",
        "Human review or conflict resolution is required before merging.",
      ],
    };
  }

  if (
    mergeability.mergeable === null ||
    mergeability.mergeableState === "unknown"
  ) {
    return {
      success: false,

      originalPR: number,

      sourceBranch: pr.headBranch,

      fixBranch: branchName,

      commits: allCommits,

      changesApplied: allChangesApplied,

      verification,

      pullRequest: fixPR,

      mergeability,

      warnings: [
        "PullPilot generated and verified the fix, but GitHub did not finish calculating mergeability.",
        "The fix PR was created but was not automatically marked as safely mergeable.",
        "Human review is required before merging.",
      ],
    };
  }

  /*
   * -------------------------------------------------------
   * 9. Return automation result
   * -------------------------------------------------------
   */

  return {
    success: true,

    originalPR: number,

    sourceBranch: pr.headBranch,

    fixBranch: branchName,

    commits: allCommits,

    changesApplied: allChangesApplied,

    verification,

    pullRequest: fixPR,

    mergeability,

    warnings: [],
  };
}