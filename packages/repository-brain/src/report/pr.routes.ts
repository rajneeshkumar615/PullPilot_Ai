import { Router } from "express";
import { analyzePR } from "../controllers/pr.controller.js";

const router: Router = Router();

router.post("/analyze", analyzePR);

export default router;