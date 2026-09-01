export type PullRequestStatus =
  | "OPEN"
  | "CLOSED"
  | "MERGED";

export interface PullRequestFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  description: string | null;

  status: PullRequestStatus;

  author: string;

  baseBranch: string;
  headBranch: string;

  baseSha: string;
  headSha: string;

  additions: number;
  deletions: number;
  changedFiles: number;

  files: PullRequestFile[];
}