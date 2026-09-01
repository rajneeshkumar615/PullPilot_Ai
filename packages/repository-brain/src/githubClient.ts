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
  const result = await githubFetch<GitHubContent>(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
      path
    )}?ref=${encodeURIComponent(ref)}`
  );

  if (result.type !== "file") {
    throw new Error(
      `GitHub path is not a file: ${path}`
    );
  }

  if (!result.content) {
    throw new Error(
      `GitHub returned no content for ${path}`
    );
  }

  const content = Buffer.from(
    result.content.replace(/\n/g, ""),
    "base64"
  ).toString("utf8");

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
  // Get the current tree from the PR HEAD.
  const baseCommit = await githubFetch<{
    tree: {
      sha: string;
    };
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseSha}`
  );

  // Create a new tree containing ALL changes.
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

  // Create one atomic commit.
  const commit = await githubFetch<{
    sha: string;
  }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [baseSha],
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