import { Router } from "express";

import {
  analyzePR,
  generateFix,
  applyFix,
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
   APPLY AI FIX
========================================================= */

router.post("/apply-fix", applyFix);

/* =========================================================
   AUTO FIX (ANALYZE + GENERATE + APPLY)
========================================================= */

router.post("/auto-fix", autoFixPR);

export default router;