import { createSnapshot } from "./snapshot.js";
import { generateRepositoryReport } from "./reportGenerator.js";
import { analyzeWithAI } from "./ai.js";
import { parseAIResponse } from "./parser/aiResponseParser.js";

export async function analyzeRepository(
  repositoryPath: string
) {
  const snapshot = await createSnapshot(repositoryPath);

  const report = await generateRepositoryReport(snapshot);

  const response = await analyzeWithAI(report);

  const ai = parseAIResponse(response);

  return {
    repository: report,
    ai,
  };
}