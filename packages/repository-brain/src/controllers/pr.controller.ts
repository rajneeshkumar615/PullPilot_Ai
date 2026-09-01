import type { Request, Response } from "express";
import { analyzePRService } from "../services/pr/pr.service.js";

export async function analyzePR(
  req: Request,
  res: Response
) {
  try {
    const { owner, repo, number } = req.body;

    if (
      typeof owner !== "string" ||
      typeof repo !== "string" ||
      typeof number !== "number"
    ) {
      return res.status(400).json({
        error: "owner, repo and number are required.",
      });
    }

    const result = await analyzePRService(
      owner,
      repo,
      number
    );

    return res.json(result);
  } catch (error) {
    console.error("PR ANALYSIS ERROR:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PR analysis failed.",
    });
  }
}