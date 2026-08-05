export interface AIProvider {
  analyze(prompt: string): Promise<string>;
}