import type { RepositoryReport } from "./report.js";

export function buildRepositoryPrompt(
  report: RepositoryReport
): string {
  return `
You are a Staff Software Engineer.

Analyze this repository.

Repository Summary

${JSON.stringify(report, null, 2)}

Return

1. Architecture overview

2. Biggest problems

3. Strengths

4. Scalability issues

5. Performance issues

6. Security issues

7. Code Quality

8. Technical debt

9. Suggested roadmap

10. Final score /100
`;
}