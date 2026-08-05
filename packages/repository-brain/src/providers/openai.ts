import type { AIProvider } from "./provider.js";

export class OpenAIProvider implements AIProvider {
  async analyze(prompt: string): Promise<string> {
    return `
OpenAI Placeholder

Prompt Length:
${prompt.length}
`;
  }
}