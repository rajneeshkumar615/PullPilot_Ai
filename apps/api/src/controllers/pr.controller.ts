import type {
  Request,
  Response,
} from "express";

import {
  analyzePRService,
  generatePRFixService,
  applyPRFixService,
  autoFixPRService,
} from "../services/pr/pr.service.js";

/* =========================================================
   ANALYZE
========================================================= */

export async function analyzePR(
  req: Request,
  res: Response
) {
  try {
    const {
      owner,
      repo,
      number,
    } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number"
    ) {
      return res.status(400).json({
        error:
          "owner, repo and number are required.",
      });
    }

    const result =
      await analyzePRService(
        owner,
        repo,
        number
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "PR ANALYSIS ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR analysis failed.",
    });
  }
}

/* =========================================================
   GENERATE FIX
========================================================= */

export async function generateFix(
  req: Request,
  res: Response
) {
  try {
    const {
      owner,
      repo,
      number,
      category,
      finding,
    } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number" ||
      typeof category !== "string" ||
      typeof finding !== "string"
    ) {
      return res.status(400).json({
        error:
          "owner, repo, number, category and finding are required.",
      });
    }

    const result =
      await generatePRFixService(
        owner,
        repo,
        number,
        category,
        finding
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "PR FIX GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR fix generation failed.",
    });
  }
}

/* =========================================================
   APPLY FIX
========================================================= */

export async function applyFix(
  req: Request,
  res: Response
) {
  try {
    const {
      owner,
      repo,
      number,
      fix,
    } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number" ||
      !fix ||
      typeof fix !== "object"
    ) {
      return res.status(400).json({
        error:
          "owner, repo, number and fix are required.",
      });
    }

    if (
      !Array.isArray(fix.changes) ||
      fix.changes.length === 0
    ) {
      return res.status(400).json({
        error:
          "fix.changes must be a non-empty array.",
      });
    }

    for (const change of fix.changes) {
      if (
        typeof change?.path !== "string" ||
        typeof change?.before !== "string" ||
        typeof change?.after !== "string"
      ) {
        return res.status(400).json({
          error:
            "Every change requires path, before and after.",
        });
      }
    }

    const result =
      await applyPRFixService(
        owner,
        repo,
        number,
        fix
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "PR FIX APPLY ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR fix application failed.",
    });
  }
}

/* =========================================================
   AUTO FIX
========================================================= */

export async function autoFixPR(
  req: Request,
  res: Response
) {
  try {
    const {
      owner,
      repo,
      number,
      category,
      finding,
    } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number" ||
      typeof category !== "string" ||
      typeof finding !== "string"
    ) {
      return res.status(400).json({
        error:
          "owner, repo, number, category and finding are required.",
      });
    }

    const result = await autoFixPRService(
      owner,
      repo,
      number,
      category,
      finding
    );

    return res.json(result);
  } catch (error) {
    console.error("PR AUTO-FIX ERROR:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR auto-fix failed.",
    });
  }
}