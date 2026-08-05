import { Request, Response } from "express";
import { analyzeRepositoryService } from "../services/repository/analyzer.service.js";

export async function analyze(
  req: Request,
  res: Response
) {
  console.log("BODY:", req.body);

  const { path } = req.body;

  console.log("PATH:", path);

  const report = await analyzeRepositoryService(path);

  res.json(report);
}