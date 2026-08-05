import { analyzeRepository } from "@pullpilot/repository-brain";

export async function analyzeRepositoryService(
  path: string
) {
  return analyzeRepository(path);
}