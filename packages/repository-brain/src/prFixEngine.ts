import {
  createBranch,
  createPullRequest,
  getPullRequest,
  getRepositoryFile,
  updateRepositoryFile,
} from "./githubClient.js";

import { verifyPRBranch } from "./prVerification.js";

export interface ApplyFixChange {
  path: string;
  explanation?: string;
  before: string;
  after: string;
}

export interface ApplyFixResult {
  success: boolean;

  branch: {
    name: string;
    base: string;
  };

  changes: Array<{
    path: string;
    applied: boolean;
    commitSha?: string;
  }>;

  pullRequest?: {
    number: number;
    url: string;
    title: string;
  };

  warnings: string[];
}

/* =========================================================
   NORMALIZE AI CODE
========================================================= */

function normalizeCode(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/* =========================================================
   BUILD UNIQUE BRANCH NAME
========================================================= */

function buildBranchName(
  number: number,
  category: string
): string {
  const cleanCategory = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const timestamp = Date.now();

  return `pullpilot/fix-pr-${number}-${cleanCategory}-${timestamp}`;
}

/* =========================================================
   APPLY PR FIX
========================================================= */

export async function applyPRFix(
  owner: string,
  repo: string,
  number: number,
  category: string,
  changes: ApplyFixChange[]
): Promise<ApplyFixResult> {
  if (!changes.length) {
    throw new Error(
      "No changes were supplied."
    );
  }

  const pr = await getPullRequest(
    owner,
    repo,
    number
  );

  if (pr.status !== "OPEN") {
    throw new Error(
      `PR #${number} is not open. Current status: ${pr.status}`
    );
  }

  if (!pr.headSha) {
    throw new Error(
      "PR head SHA is missing."
    );
  }

  /*
   * NEVER apply directly to the base branch.
   */
  const branchName = buildBranchName(
    number,
    category
  );

  /*
   * Create branch from the current PR HEAD.
   */
  await createBranch(
    owner,
    repo,
    branchName,
    pr.headSha
  );

  const appliedChanges: ApplyFixResult["changes"] =
    [];

  const warnings: string[] = [];

  /*
   * Apply each AI-generated change.
   */
  for (const change of changes) {
    const currentFile =
      await getRepositoryFile(
        owner,
        repo,
        change.path,
        branchName
      );

    const expectedBefore =
      normalizeCode(change.before);

    const actualBefore =
      normalizeCode(currentFile.content);

    /*
     * SAFETY CHECK
     *
     * We do not blindly overwrite the file.
     *
     * The AI "before" must exist in the actual
     * GitHub file.
     */
    if (
      !actualBefore.includes(expectedBefore)
    ) {
      warnings.push(
        `Skipped ${change.path}: AI before-code does not match the current GitHub file.`
      );

      appliedChanges.push({
        path: change.path,
        applied: false,
      });

      continue;
    }

    const updatedContent =
      currentFile.content.replace(
        change.before,
        change.after
      );

    if (
      updatedContent === currentFile.content
    ) {
      warnings.push(
        `Skipped ${change.path}: applying the proposed replacement produced no change.`
      );

      appliedChanges.push({
        path: change.path,
        applied: false,
      });

      continue;
    }

    const commit =
      await updateRepositoryFile(
        owner,
        repo,
        change.path,
        branchName,
        updatedContent,
        currentFile.sha,
        `fix: apply PullPilot recommendation to ${change.path}`
      );

    appliedChanges.push({
      path: change.path,
      applied: true,
      commitSha: commit.commitSha,
    });
  }

  const successfulChanges =
    appliedChanges.filter(
      (change) => change.applied
    );

  if (!successfulChanges.length) {
    return {
      success: false,

      branch: {
        name: branchName,
        base: pr.headBranch,
      },

      changes: appliedChanges,

      warnings: [
        ...warnings,
        "No changes were safely applied. Pull request was not created.",
      ],
    };
  }

  /*
   * VERIFY THE FIX BEFORE CREATING THE PR
   */
  console.log(
    `🧪 PullPilot: verifying fix branch ${branchName}`
  );

  const verification =
    await verifyPRBranch(
      owner,
      repo,
      branchName
    );

  if (!verification.success) {
    return {
      success: false,

      branch: {
        name: branchName,
        base: pr.headBranch,
      },

      changes: appliedChanges,

      warnings: [
        ...warnings,
        "Automated verification failed. Pull request was not created.",
        verification.error ??
          verification.output,
      ],
    };
  }

  console.log(
    `✅ PullPilot: verification passed`
  );

  /*
   * Create the final GitHub PR.
   */
  const fixPR =
    await createPullRequest(
      owner,
      repo,
      `fix: PullPilot automated fix for PR #${number}`,

      buildPRBody(
        number,
        category,
        successfulChanges.map(
          (change) => change.path
        ),
        warnings
      ),

      branchName,
      pr.headBranch
    );

  return {
    success: true,

    branch: {
      name: branchName,
      base: pr.headBranch,
    },

    changes: appliedChanges,

    pullRequest: {
      number: fixPR.number,
      url: fixPR.url,
      title: fixPR.title,
    },

    warnings,
  };
}

/* =========================================================
   PR DESCRIPTION
========================================================= */

function buildPRBody(
  originalPR: number,
  category: string,
  files: string[],
  warnings: string[]
): string {
  const fileList = files
    .map((file) => `- \`${file}\``)
    .join("\n");

  const warningSection =
    warnings.length > 0
      ? `
## PullPilot Warnings

${warnings
  .map((warning) => `- ${warning}`)
  .join("\n")}
`
      : "";

  return `## PullPilot Automated Fix

This pull request was generated by **PullPilot AI**.

### Original PR

PR #${originalPR}

### Finding Category

${category}

### Files Changed

${fileList}

### Validation

- AI-generated fix reviewed
- Existing file content verified before replacement
- Changes applied only to a dedicated PullPilot branch
- Original PR branch was not modified directly

${warningSection}

> Generated by PullPilot AI. Human review is required before merging.
`;
}