import { OpenRouterProvider } from "./providers/openrouter.js";
import { buildRepositoryPrompt } from "./prompts.js";
import type { RepositoryReport } from "./report.js";

const provider = new OpenRouterProvider();

export async function analyzeWithAI(
  report: RepositoryReport
) {
  const prompt = buildRepositoryPrompt(report);

  return provider.analyze(prompt);
}