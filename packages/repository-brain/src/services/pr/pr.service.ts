import { analyzePullRequest } from "@pullpilot/repository-brain";

export async function analyzePRService(
  owner: string,
  repo: string,
  number: number
) {
  return analyzePullRequest(owner, repo, number);
}