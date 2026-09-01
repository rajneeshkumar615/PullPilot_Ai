import { Router, type IRouter } from "express";
import { analyzePR } from "../controllers/pr.controller.js";

const router: IRouter = Router();

router.post("/analyze", analyzePR);

export default router;