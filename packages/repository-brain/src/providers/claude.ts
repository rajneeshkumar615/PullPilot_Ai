import type { AIProvider } from "./provider.js";

export class ClaudeProvider implements AIProvider {
  async analyze(prompt: string): Promise<string> {
    return `
Claude Placeholder

Prompt Length:
${prompt.length}
`;
  }
}