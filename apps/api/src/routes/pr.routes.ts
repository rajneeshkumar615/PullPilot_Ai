import { Router } from "express";

import {
  analyzePR,
  generateFix,
  generateAllFixes,
  applyFix,
  cancelPRExecution,
  autoFixPR,
} from "../controllers/pr.controller.js";

const router = Router();

/* =========================================================
   ANALYZE PULL REQUEST
========================================================= */

router.post("/analyze", analyzePR);

/* =========================================================
   GENERATE AI FIX
========================================================= */

router.post("/generate-fix", generateFix);

/* =========================================================
   GENERATE ALL AI FIXES
========================================================= */

router.post(
  "/generate-all-fixes",
  generateAllFixes
);

/* =========================================================
   APPLY AI FIX
========================================================= */

router.post("/apply-fix", applyFix);

/* =========================================================
   CANCEL AUTONOMOUS EXECUTION
========================================================= */

router.post("/cancel", cancelPRExecution);

/* =========================================================
   AUTO FIX (ANALYZE + GENERATE + APPLY)
========================================================= */

router.post("/auto-fix", autoFixPR);

export default router;