import type { AIReport } from "../models/AIReport.js";

export function parseAIResponse(
  response: string
): AIReport {
  try {
    return JSON.parse(response);
  } catch {
    return {
      score: 0,
      summary: "Unable to parse AI response.",
      strengths: [],
      weaknesses: [],
      security: [],
      performance: [],
      roadmap: [],
    };
  }
}