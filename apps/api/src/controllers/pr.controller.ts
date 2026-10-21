import type {
  Request,
  Response,
} from "express";

import {
  analyzePRService,
  generatePRFixService,
  generateAllPRFixesService,
  applyPRFixService,
  autoFixPRService,
} from "../services/pr/pr.service.js";
import {
  createExecution,
  cancelExecution,
  removeExecution,
} from "@pullpilot/repository-brain";
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
   GENERATE ALL FIXES
========================================================= */

export async function generateAllFixes(
  req: Request,
  res: Response
) {
  try {
    const {
      owner,
      repo,
      number,
      findings,
    } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number" ||
      !Array.isArray(findings) ||
      findings.length === 0
    ) {
      return res.status(400).json({
        error:
          "owner, repo, number and findings are required.",
      });
    }

    for (const item of findings) {
      if (
        typeof item?.category !== "string" ||
        typeof item?.finding !== "string"
      ) {
        return res.status(400).json({
          error:
            "Every finding requires category and finding.",
        });
      }
    }

    const result =
      await generateAllPRFixesService(
        owner,
        repo,
        number,
        findings
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "PR ALL FIXES GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR all-fixes generation failed.",
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
      mode,
      executionId,
      forceMerge,
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
    typeof change?.after !== "string" ||
    change.before.length === 0
  ) {return res.status(400).json({
  error:
    "Every change requires path, non-empty before and after.",
});
      }
    }

    if (
      mode !== undefined &&
      mode !== "human" &&
      mode !== "autonomous"
    ) {
      return res.status(400).json({
        error:
          'mode must be either "human" or "autonomous".',
      });
    }

    if (
      forceMerge !== undefined &&
      typeof forceMerge !== "boolean"
    ) {
      return res.status(400).json({
        error: "forceMerge must be a boolean.",
      });
    }

    if (
      forceMerge === true &&
      mode !== "autonomous"
    ) {
      return res.status(400).json({
        error:
          "forceMerge is only allowed for autonomous execution.",
      });
    }

    if (
      mode === "autonomous" &&
      (typeof executionId !== "string" ||
        !executionId.trim())
    ) {
      return res.status(400).json({
        error:
          "executionId is required for autonomous execution.",
      });
    }

    if (
      mode !== "autonomous" &&
      executionId !== undefined
    ) {
      return res.status(400).json({
        error:
          "executionId is only allowed for autonomous execution.",
      });
    }

    if (mode === "autonomous") {
      createExecution(executionId);
    }

    try {
      console.log(
  "[DEBUG] /api/pr/apply-fix incoming fix:",
  JSON.stringify(fix, null, 2)
);

      const result = await applyPRFixService(
        owner,
        repo,
        number,
        fix,
        mode ?? "human",
        executionId,
        forceMerge === true
      );

      return res.json(result);
    } finally {
      if (typeof executionId === "string") {
        removeExecution(executionId);
      }
    }
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
   CANCEL AUTONOMOUS EXECUTION
========================================================= */

export async function cancelPRExecution(
  req: Request,
  res: Response
) {
  try {
    const { executionId } = req.body;

    if (typeof executionId !== "string" || !executionId.trim()) {
      return res.status(400).json({
        error: "executionId is required.",
      });
    }

    const cancelled = cancelExecution(executionId);

    if (!cancelled) {
      return res.status(404).json({
        error: "Execution was not found or has already completed.",
      });
    }

    return res.json({
      success: true,
      cancelled: true,
      message: "Autonomous execution cancellation requested.",
    });
  } catch (error) {
    console.error("PR EXECUTION CANCEL ERROR:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to cancel autonomous execution.",
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
      mode,
      executionId,
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

    if (
      mode !== undefined &&
      mode !== "human" &&
      mode !== "autonomous"
    ) {
      return res.status(400).json({
        error:
          'mode must be either "human" or "autonomous".',
      });
    }

    if (
      mode === "autonomous" &&
      (typeof executionId !== "string" ||
        !executionId.trim())
    ) {
      return res.status(400).json({
        error:
          "executionId is required for autonomous execution.",
      });
    }

    if (
      mode !== "autonomous" &&
      executionId !== undefined
    ) {
      return res.status(400).json({
        error:
          "executionId is only allowed for autonomous execution.",
      });
    }

    if (mode === "autonomous") {
      createExecution(executionId);
    }

    try {
      const result = await autoFixPRService(
        owner,
        repo,
        number,
        category,
        finding,
        mode ?? "human",
        executionId
      );

      return res.json(result);
    } finally {
      if (typeof executionId === "string") {
        removeExecution(executionId);
      }
    }
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