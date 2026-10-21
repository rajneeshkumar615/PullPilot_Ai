import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { simpleGit } from "simple-git";
import {
  verifyRepository,
} from "./verification.js";

export interface PRVerificationResult {
  success: boolean;
  command: string;
  output: string;
  error?: string;
}

function getGitHubCloneUrl(
  owner: string,
  repo: string
): string {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not configured."
    );
  }

  return `https://${token}@github.com/${owner}/${repo}.git`;
}

export async function verifyPRBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<PRVerificationResult> {
  const tempDirectory = await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pullpilot-verification-"
    )
  );

  try {
    console.log(
      `🧪 PullPilot: cloning ${owner}/${repo}@${branch}`
    );

    const git = simpleGit();

    await git.clone(
      getGitHubCloneUrl(owner, repo),
      tempDirectory,
      [
        "--branch",
        branch,
        "--single-branch",
        "--depth",
        "1",
      ]
    );

    console.log(
      `✅ PullPilot: repository cloned`
    );

    const result =
      await verifyRepository(
        tempDirectory
      );

    return result;
  } finally {
    console.log(
      `🧹 PullPilot: removing temporary workspace`
    );

    await fs.rm(
      tempDirectory,
      {
        recursive: true,
        force: true,
      }
    );
  }
}