import { Router } from "express";
import healthRouter from "./health.route.js";
import prRouter from "./pr.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/pr", prRouter);

export default router;