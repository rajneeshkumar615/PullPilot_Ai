import {
  simpleGit,
  type DefaultLogFields,
} from "simple-git";

export interface RecentCommit {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export interface GitMetrics {
  totalCommits: number;
  contributors: number;
  recentCommits: RecentCommit[];
}

export async function analyzeGitRepository(
  repositoryPath: string
): Promise<GitMetrics> {
  const git = simpleGit(repositoryPath);

  const log = await git.log();

  const authors = new Set(
    log.all.map((c) => c.author_name)
  );

  return {
    totalCommits: log.total,

    contributors: authors.size,

    recentCommits: log.all
      .slice(0, 10)
      .map((commit: DefaultLogFields) => ({
        hash: commit.hash,
        author: commit.author_name,
        message: commit.message,
        date: commit.date,
      })),
  };
}