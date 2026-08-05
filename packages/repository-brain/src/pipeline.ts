import { createSnapshot } from "./snapshot.js";
import { generateRepositoryReport } from "./reportGenerator.js";
import { analyzeWithAI } from "./ai.js";
import { parseAIResponse } from "./parser/aiResponseParser.js";
import { buildInsights } from "./insightsEngine.js";
import { calculateHealth } from "./healthScore.js";
import { buildMetrics } from "./metrics.js";

export async function analyzeRepository(
  repositoryPath: string
) {
  const snapshot = await createSnapshot(repositoryPath);

  const report = await generateRepositoryReport(snapshot);

  const response = await analyzeWithAI(report);

  const ai = parseAIResponse(response);

  const insights = buildInsights(report);

  const health = calculateHealth(report);

  const metrics = buildMetrics(report);

  return {
    repository: report,
    ai,
    insights,
    health,
    metrics,
  };
}