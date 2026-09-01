import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import repositoryRoutes from "./routes/repository.routes.js";
import apiRoutes from "./routes/index.js";

import {
  getPullRequest,
  checkPullRequestMergeability,
} from "@pullpilot/repository-brain";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Health route works!",
  });
});

app.get("/api/debug/github-user", async (_req, res) => {
  try {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "GITHUB_TOKEN is not loaded.",
      });
    }

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const data = await response.json();

    return res.status(response.status).json({
      success: response.ok,
      status: response.status,
      login: response.ok ? data.login : undefined,
      error: response.ok ? undefined : data.message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "GitHub authentication test failed.",
    });
  }
});

app.get(
  "/api/debug/open-prs/:owner/:repo",
  async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const token = process.env.GITHUB_TOKEN;

      if (!token) {
        return res.status(500).json({
          success: false,
          error: "GITHUB_TOKEN is not loaded.",
        });
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: data.message,
        });
      }

      return res.json({
        success: true,
        count: data.length,
        pullRequests: data.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          head: pr.head.ref,
          headSha: pr.head.sha,
          base: pr.base.ref,
          baseSha: pr.base.sha,
          draft: pr.draft,
        })),
      });
    } catch (error) {
      console.error(
        "OPEN PR DEBUG ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch open PRs.",
      });
    }
  }
);

app.get(
  "/api/debug/compare/:owner/:repo/:base/:head",
  async (req, res) => {
    try {
      const { owner, repo, base, head } = req.params;

      const token = process.env.GITHUB_TOKEN;

      if (!token) {
        return res.status(500).json({
          success: false,
          error: "GITHUB_TOKEN is not loaded.",
        });
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(
          base
        )}...${encodeURIComponent(head)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      const data = await response.json();

      return res.status(response.status).json({
        success: response.ok,
        status: data.status,
        ahead_by: data.ahead_by,
        behind_by: data.behind_by,
        total_commits: data.total_commits,
        message: data.message,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "GitHub comparison failed.",
      });
    }
  }
);

app.get(
  "/api/debug/pr/:owner/:repo/:number",
  async (req, res) => {
    try {
      const owner = req.params.owner;
      const repo = req.params.repo;
      const number = Number(req.params.number);

      if (!owner || !repo || !Number.isInteger(number)) {
        return res.status(400).json({
          success: false,
          error: "Invalid owner, repo or PR number.",
        });
      }

      const pr = await getPullRequest(
        owner,
        repo,
        number
      );

      const mergeability =
        await checkPullRequestMergeability(
          owner,
          repo,
          number
        );

      return res.json({
        success: true,

        pullRequest: {
          number: pr.number,
          title: pr.title,
          status: pr.status,

          baseBranch: pr.baseBranch,
          baseSha: pr.baseSha,

          headBranch: pr.headBranch,
          headSha: pr.headSha,

          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changedFiles,
        },

        mergeability,
      });
    } catch (error) {
      console.error(
        "PR DEBUG ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "PR diagnostic failed.",
      });
    }
  }
);

// Repository Brain API
app.use("/api/repository", repositoryRoutes);

// PullPilot API
app.use("/api", apiRoutes);

export default app;