import type { AIProvider } from "./provider.js";

export class GeminiProvider implements AIProvider {
  async analyze(prompt: string): Promise<string> {
    console.log(prompt);

    return JSON.stringify({
      score: 94,

      summary: "Excellent engineering quality.",

      strengths: [
        "Strong architecture",
        "Good modularity",
        "Type-safe implementation"
      ],

      weaknesses: [
        "Limited testing",
        "No caching layer"
      ],

      security: [
        "Review authentication flow",
        "Validate external inputs"
      ],

      performance: [
        "Parallelize repository analysis",
        "Introduce caching"
      ],

      roadmap: [
        "Repository Chat",
        "Vector Search",
        "Embeddings",
        "Pull Request Review",
        "Incremental Analysis"
      ]
    });
  }
}