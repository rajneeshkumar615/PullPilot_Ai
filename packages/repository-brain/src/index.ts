import { createSnapshot } from "./snapshot.js";
import { generateRepositoryReport } from "./reportGenerator.js";
import { analyzeWithAI } from "./ai.js";
import { parseAIResponse } from "./parser/aiResponseParser.js";
import { buildInsights } from "./insightsEngine.js";
import { calculateHealth } from "./healthScore.js";
import { buildMetrics } from "./metrics.js";

export {
  analyzePullRequest,
  generatePRFix,
  applyPRFix,
} from "./prAnalyzer.js";

export {
  getPullRequest,
  checkPullRequestMergeability,
} from "./githubClient.js";

export async function analyzeRepository(
  repositoryPath: string
) {
  // KEEP EVERYTHING BELOW EXACTLY AS IT IS
  const snapshot = await createSnapshot(repositoryPath);
  
  const repository = await generateRepositoryReport(snapshot);
  
  const response = await analyzeWithAI(repository);

  console.log("RAW RESPONSE TYPE:", typeof response);
  console.log("RAW RESPONSE:", response);

  const ai = parseAIResponse(response);

  console.log("PARSED TYPE:", typeof ai);
  console.log("PARSED AI:", JSON.stringify(ai, null, 2));

  const insights = buildInsights(repository);
  
  const health = calculateHealth(repository);

  const metrics = buildMetrics(repository);

  return {
    repository,
    ai,
    insights,
    health,
    metrics,
  };
}