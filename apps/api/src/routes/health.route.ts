import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "PullPilot API",
    status: "healthy",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

export default router;