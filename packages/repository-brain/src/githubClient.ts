import type { PullRequest } from "./pr.js";

const GITHUB_API = "https://api.github.com";

function headers() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured.");
  }

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function githubFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const maxAttempts = 3;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers(),
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `GitHub API ${response.status}: ${body}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;

      const cause =
        error instanceof Error ? error.cause : undefined;

      const code =
        cause &&
        typeof cause === "object" &&
        "code" in cause
          ? String(
              (cause as { code?: unknown }).code
            )
          : "";

      const isTransientNetworkError =
        code === "UND_ERR_CONNECT_TIMEOUT" ||
        code === "ENOTFOUND" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "EAI_AGAIN";

      if (
        !isTransientNetworkError ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      const delay = attempt * 1000;

      console.warn(
        `PullPilot: GitHub request failed (${code || "network error"}). ` +
        `Retrying in ${delay}ms... (${attempt}/${maxAttempts - 1})`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw lastError;
}

/* =========================================================
  TYPES
========================================================= */

export interface GitHubPRFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  merge_commit_sha: string | null;
  merged_at: string | null;

  user: {
    login: string;
  };

  base: {
    ref: string;
    sha: string;
  };

  head: {
    ref: string;
    sha: string;
  };

  additions: number;
  deletions: number;
  changed_files: number;
}

interface GitHubBranchRef {
  ref: string;
  node_id: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
}

interface GitHubContent {
  type: string;
  encoding?: string;
  size?: number;
  name: string;
  path: string;
  sha: string;
  content?: string;
}

interface GitHubCommit {
  sha: string;
}

interface GitHubPullRequestCreated {
  number: number;
  html_url: string;
  title: string;
  state: string;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

/* =========================================================
  GET PULL REQUEST
========================================================= */

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequest> {
  const pr = await githubFetch<GitHubPullRequest>(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`
  );

  const files = await githubFetch<GitHubPRFile[]>(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`
  );

  return {
    number: pr.number,
    title: pr.title,
    description: pr.body,

    status: pr.merged
      ? "MERGED"
      : pr.state === "open"
        ? "OPEN"
        : "CLOSED",

    author: pr.user.login,

    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,

    merged: pr.merged,
    mergeCommitSha: pr.merge_commit_sha,
    mergedAt: pr.merged_at,

    additions: pr.additions,

    deletions: pr.deletions,
    changedFiles: pr.changed_files,

    files: files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,

      ...(file.patch !== undefined
        ? { patch: file.patch }
        : {}),
    })),
  };
}

/* =========================================================
  GET FILE FROM GITHUB
========================================================= */

export async function getRepositoryFile(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<{
  path: string;
  sha: string;
  content: string;
}> {
  if (!path.trim()) {
    throw new Error("GitHub repository file path is empty.");
  }

  if (!ref.trim()) {
    throw new Error(
      `GitHub repository file ref is empty for ${path}.`
    );
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  let result: GitHubContent;

  try {
    result = await githubFetch<GitHubContent>(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(
        ref
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown GitHub API error.";

    throw new Error(
      `Unable to fetch GitHub file "${path}" at ref "${ref}": ${message}`
    );
  }

  if (result.type !== "file") {
    throw new Error(
      `GitHub path is not a file: ${path}`
    );
  }

  if (!result.content) {
    throw new Error(
      `GitHub returned no content for "${path}" at ref "${ref}".`
    );
  }

  const content = Buffer.from(
    result.content.replace(/\n/g, ""),
    "base64"
  )
    .toString("utf8")
    .replace(/\r\n/g, "\n");

  if (!content.trim()) {
    throw new Error(
      `GitHub returned an empty file for "${path}" at ref "${ref}".`
    );
  }

  if (
    result.path !== path &&
    decodeURIComponent(result.path) !== path
  ) {
    throw new Error(
      `GitHub returned unexpected file path "${result.path}" while requesting "${path}".`
    );
  }

  return {
    path: result.path,
    sha: result.sha,
    content,
  };
}
/* =========================================================
  CREATE BRANCH
========================================================= */

export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  sourceSha: string
): Promise<{
  branch: string;
  sha: string;
}> {
  const result = await githubFetch<GitHubBranchRef>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: sourceSha,
      }),
    }
  );

  return {
    branch: branchName,
    sha: result.object.sha,
  };
}

/* =========================================================
  APPLY FILE CHANGE
========================================================= */

export async function updateRepositoryFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  content: string,
  sha: string,
  message: string
): Promise<{
  path: string;
  commitSha: string;
}> {
  const result = await githubFetch<{
    content: {
      path: string;
      sha: string;
    };
    commit: GitHubCommit;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
      path
    )}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf8").toString(
          "base64"
        ),
        branch,
        sha,
      }),
    }
  );

  return {
    path: result.content.path,
    commitSha: result.commit.sha,
  };
}

/* =========================================================
  DELETE FILE
========================================================= */

export async function deleteRepositoryFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  sha: string,
  message: string
): Promise<{
  path: string;
  commitSha: string;
}> {
  const result = await githubFetch<{
    commit: GitHubCommit;
    content: null;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
      path
    )}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        message,
        branch,
        sha,
      }),
    }
  );

  return {
    path,
    commitSha: result.commit.sha,
  };
}

/* =========================================================
  ATOMIC MULTI-FILE COMMIT
========================================================= */

 export async function createCommitWithFiles(
  owner: string,
  repo: string,
  branch: string,
  baseSha: string,
  files: Array<{
    path: string;
    content: string;
  }>,
  message: string
): Promise<{
  commitSha: string;
  treeSha: string;
}> {
  // Always read the CURRENT branch tip.
  // Do not assume the original PR HEAD is still the branch tip.
  const branchRef = await githubFetch<{
    object: {
      sha: string;
    };
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(
      branch
    )}`
  );

  const currentBranchSha = branchRef.object.sha;

  // Safety check:
  // The branch must still start from the PR HEAD.
  // If something unexpectedly moved the branch before this commit,
  // stop instead of creating a divergent history.
  if (currentBranchSha !== baseSha) {
    throw new Error(
      `PullPilot safety check failed: fix branch ${branch} moved unexpectedly. ` +
        `Expected ${baseSha}, found ${currentBranchSha}.`
    );
  }

  // Get the tree from the CURRENT branch commit.
  const baseCommit = await githubFetch<{
    tree: {
      sha: string;
    };
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${currentBranchSha}`
  );

  // Create a new tree containing ALL validated changes.
  const tree = await githubFetch<{
    sha: string;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: files.map((file) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
        })),
      }),
    }
  );

  // Create one atomic commit whose parent is the ACTUAL branch tip.
  const commit = await githubFetch<{
    sha: string;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [currentBranchSha],
      }),
    }
  );

  // Move the fix branch to the new commit.
  await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(
      branch
    )}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    }
  );

  return {
    commitSha: commit.sha,
    treeSha: tree.sha,
  };
}

/* =========================================================
  CREATE PULL REQUEST
========================================================= */

export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string
): Promise<{
  number: number;
  url: string;
  title: string;
  head: string;
  base: string;
}> {
  const result =
    await githubFetch<GitHubPullRequestCreated>(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          head,
          base,
        }),
      }
    );

  return {
    number: result.number,
    url: result.html_url,
    title: result.title,
    head: result.head.ref,
    base: result.base.ref,
  };
}


/* =========================================================
  CHECK PULL REQUEST MERGEABILITY
========================================================= */

export interface GitHubMergeability {
  mergeable: boolean | null;
  mergeableState: string;
  state: "open" | "closed";
  title: string;
}

export async function checkPullRequestMergeability(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubMergeability> {
  const pr = await githubFetch<{
    mergeable: boolean | null;
    mergeable_state: string;
    state: "open" | "closed";
    title: string;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`
  );

  return {
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    state: pr.state,
    title: pr.title,
  };
}

/* =========================================================
  CHECK PULL REQUEST CHECKS (CI STATUS)
========================================================= */

export interface GitHubCheckStatus {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  pending: number;
}

export async function checkPullRequestChecks(
  owner: string,
  repo: string,
  ref: string
): Promise<GitHubCheckStatus> {
  const [checkRunsResult, statusResult] = await Promise.all([
    githubFetch<{
      total_count: number;
      check_runs: Array<{
        status: string;
        conclusion: string | null;
      }>;
    }>(
      `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(
        ref
      )}/check-runs`
    ),

    githubFetch<{
      total_count: number;
      statuses: Array<{
        state: string;
      }>;
    }>(
      `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(
        ref
      )}/status`
    ),
  ]);

  const checkRuns = checkRunsResult.check_runs;
  const statuses = statusResult.statuses;

  const checkRunTotal = checkRunsResult.total_count;
  const statusTotal = statusResult.total_count;

  const completedCheckRuns = checkRuns.filter(
    (check) => check.status === "completed"
  );

  const successfulCheckRuns = completedCheckRuns.filter(
    (check) => check.conclusion === "success"
  );

  const failedCheckRuns = completedCheckRuns.filter(
    (check) => check.conclusion !== "success"
  );

  const pendingCheckRuns = checkRuns.filter(
    (check) => check.status !== "completed"
  );

  const successfulStatuses = statuses.filter(
    (status) => status.state === "success"
  );

  const failedStatuses = statuses.filter(
    (status) =>
      status.state === "failure" ||
      status.state === "error"
  );

  const pendingStatuses = statuses.filter(
    (status) =>
      status.state === "pending" ||
      status.state === "queued"
  );

  return {
    total: checkRunTotal + statusTotal,
    completed:
      completedCheckRuns.length +
      (statusTotal - pendingStatuses.length),
    successful:
      successfulCheckRuns.length +
      successfulStatuses.length,
    failed:
      failedCheckRuns.length +
      failedStatuses.length,
    pending:
      pendingCheckRuns.length +
      pendingStatuses.length,
  };
}

/* =========================================================
  MERGE PULL REQUEST
========================================================= */

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number
) {
  return githubFetch<{
    merged: boolean;
    message: string;
    sha?: string;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        merge_method: "squash",
      }),
    }
  );
}

/* =========================================================
  COMPARE BRANCHES
========================================================= */

export interface GitHubComparison {
  status: string;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
}

export async function compareBranches(
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<GitHubComparison> {
  const result = await githubFetch<{
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(
      base
    )}...${encodeURIComponent(head)}`
  );

  return {
    status: result.status,
    aheadBy: result.ahead_by,
    behindBy: result.behind_by,
    totalCommits: result.total_commits,
  };
}