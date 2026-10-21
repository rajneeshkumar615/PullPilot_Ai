import {
  getPullRequest,
  getRepositoryFile,
  createBranch,
  createCommitWithFiles,
  deleteRepositoryFile,
  createPullRequest,
  checkPullRequestMergeability,
  checkPullRequestChecks,
  mergePullRequest,
  compareBranches,
  type GitHubMergeability,
} from "./githubClient.js";

import { OpenRouterProvider } from "./providers/openrouter.js";
import { verifyPRBranch } from "./prVerification.js";
import { isExecutionCancelled } from "./executionRegistry.js";

export interface PRAnalysis {
  summary: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  bugs: string[];
  security: string[];
  performance: string[];
  maintainability: string[];
  recommendations: string[];
}

export interface PRFix {
  summary: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  changes: Array<{
    path: string;
    explanation: string;
    before: string;
    after: string;
  }>;
  tests: string[];
  warnings: string[];
}

export type PRExecutionMode = "human" | "autonomous";

/* =========================================================
   CANCELLATION
========================================================= */

function checkExecutionCancelled(
  executionId?: string
): void {
  if (
    executionId &&
    isExecutionCancelled(executionId)
  ) {
    throw new Error(
      "AUTONOMOUS_EXECUTION_CANCELLED"
    );
  }
}

/* =========================================================
   PR ANALYSIS PROMPT
========================================================= */

function buildPRPrompt(pr: any): string {
  const files = Array.isArray(pr.files)
    ? pr.files
        .map(
          (file: any) => `
FILE: ${file.path}
STATUS: ${file.status}
ADDITIONS: ${file.additions}
DELETIONS: ${file.deletions}

PATCH:
${file.patch ?? "No patch available"}
`
        )
        .join("\n---\n")
    : "No changed files available.";

  return `
Analyze this GitHub Pull Request as a Staff Software Engineer.

PR:

Title:
${pr.title}

Description:
${pr.description ?? "No description"}

Author:
${pr.author}

Base branch:
${pr.baseBranch}

Head branch:
${pr.headBranch}

Additions:
${pr.additions}

Deletions:
${pr.deletions}

Changed files:
${pr.changedFiles}

${files}

Return ONLY valid JSON using exactly this structure:

{
  "summary": "short engineering summary",
  "risk": "LOW",
  "score": 0,
  "bugs": [],
  "security": [],
  "performance": [],
  "maintainability": [],
  "recommendations": []
}

Rules:

- score must be between 0 and 100
- risk must be LOW, MEDIUM, or HIGH
- bugs must contain concrete potential bugs
- security must contain security concerns
- performance must contain performance concerns
- maintainability must contain maintainability concerns
- recommendations must contain actionable engineering recommendations
- Do not invent issues that are not supported by the patch.
`;
}

/* =========================================================
   PARSE PR ANALYSIS
========================================================= */

function parsePRAnalysis(
  response: string
): PRAnalysis {
  try {
    const parsed = JSON.parse(response);

    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "No summary provided.",

      risk:
        parsed.risk === "HIGH" ||
        parsed.risk === "MEDIUM" ||
        parsed.risk === "LOW"
          ? parsed.risk
          : "MEDIUM",

      score:
        typeof parsed.score === "number"
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round(parsed.score)
              )
            )
          : 0,

      bugs: Array.isArray(parsed.bugs)
        ? parsed.bugs.filter(
            (item: unknown) =>
              typeof item === "string"
          )
        : [],

      security: Array.isArray(
        parsed.security
      )
        ? parsed.security.filter(
            (item: unknown) =>
              typeof item === "string"
          )
        : [],

      performance: Array.isArray(
        parsed.performance
      )
        ? parsed.performance.filter(
            (item: unknown) =>
              typeof item === "string"
          )
        : [],

      maintainability: Array.isArray(
        parsed.maintainability
      )
        ? parsed.maintainability.filter(
            (item: unknown) =>
              typeof item === "string"
          )
        : [],

      recommendations: Array.isArray(
        parsed.recommendations
      )
        ? parsed.recommendations.filter(
            (item: unknown) =>
              typeof item === "string"
          )
        : [],
    };
  } catch {
    return {
      summary:
        "AI returned an invalid PR analysis response.",
      risk: "MEDIUM",
      score: 0,
      bugs: [],
      security: [],
      performance: [],
      maintainability: [],
      recommendations: [],
    };
  }
}

/* =========================================================
   PR ANALYSIS
========================================================= */

export async function analyzePullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<PRAnalysis> {
  const pr = await getPullRequest(
    owner,
    repo,
    number
  );

  const prompt = buildPRPrompt(pr);

  const provider = new OpenRouterProvider();

  const response =
    await provider.analyze(prompt);

  return parsePRAnalysis(response);
}

/* =========================================================
   AI FIX GENERATOR PROMPT
========================================================= */

function buildFixPrompt(
  owner: string,
  repo: string,
  number: number,
  pr: any,
  findings: Array<{
    category: string;
    finding: string;
  }>,
  fileContents: Array<{
    path: string;
    content: string;
  }>
): string {
  const findingsText = findings
    .map(
      (item, index) =>
        `${index + 1}. [${item.category}] ${item.finding}`
    )
    .join("\n");

  const repositoryContext = fileContents
    .map(
      ({ path, content }) =>
        `===== FILE: ${path} =====\n${content}\n===== END FILE: ${path} =====`
    )
    .join("\n\n");

  return `
You are PullPilot's senior code-fixing agent.

Your task is to generate ONE CONSOLIDATED, SAFE, EXACT fix plan for the supplied pull request.

You are NOT being asked to review the code again.
You are NOT being asked to invent improvements.
You MUST generate concrete code changes that directly resolve the supplied findings.

==================================================
PULL REQUEST
==================================================

Repository:
${owner}/${repo}

Pull Request:
#${number}

Base branch:
${pr.baseBranch}

PR head branch:
${pr.headBranch}

==================================================
FINDINGS
==================================================

${findingsText}

==================================================
ACTUAL PR HEAD FILE CONTENT
==================================================

The following files are the ACTUAL file contents from the PR HEAD.

Treat this content as the ONLY source of truth for BEFORE code.

${repositoryContext}

==================================================
ABSOLUTE PATCH RULES
==================================================

1. Every change MUST target code that actually exists in the supplied PR HEAD.

2. The "before" field MUST be copied EXACTLY from the supplied file content.

3. Preserve every character in the BEFORE block:
   - indentation
   - spaces
   - tabs
   - quotes
   - commas
   - line breaks
   - capitalization
   - semicolons

4. NEVER normalize, reformat, shorten, pretty-print, or rewrite the BEFORE block.

5. The BEFORE block MUST be a contiguous substring of the actual file.

6. The BEFORE block MUST be the SMALLEST practical contiguous code fragment that directly causes the finding.

7. Do NOT use an entire object, function, configuration block, or file when only one property/value needs to change.

8. Example:
   If the actual PR HEAD contains:

   httpOnly: false,

   and the finding says HttpOnly must be enabled, the correct change is:

   BEFORE:
   httpOnly: false,

   AFTER:
   httpOnly: true,

   Do NOT replace the entire cookie object.
   Do NOT replace the entire session configuration.
   Do NOT replace the entire file.

9. The AFTER block MUST contain the complete replacement for the selected BEFORE block.

10. The AFTER block MUST visibly resolve the finding.

11. BEFORE and AFTER MUST NOT be identical.

12. Do NOT invent surrounding code.

13. Do NOT include code that was not supplied in the actual PR HEAD.

14. Do NOT make unrelated refactors.

15. Do NOT change formatting outside the exact targeted fragment.

16. If multiple findings affect the same small code region, consolidate them into ONE non-overlapping change whenever possible.

17. NEVER return overlapping changes for the same file.

18. NEVER return two changes where one BEFORE block contains the other BEFORE block.

19. If two findings can be fixed by changing the same exact property, return one change.

20. If a finding cannot be safely fixed from the supplied context, do NOT guess.
    Instead, omit that change and explain the limitation in warnings.

    20a. For a finding specifically about the session cookie's httpOnly property:
    - Change only the httpOnly property required by the finding.
    - Do NOT modify secure or sameSite as part of that change.
    - If secure or sameSite requires a separate change, omit that change and explain it in warnings.

21. A change is valid only if:
    - path exists in the supplied PR HEAD context
    - BEFORE exists exactly in that file
    - BEFORE and AFTER differ
    - AFTER addresses the finding
    - the change does not modify unrelated behavior

22. NEVER claim that a finding is fixed merely by adding a comment.

23. NEVER return a theoretical patch.

24. NEVER use placeholders such as:
    "...",
    "<existing code>",
    "same as above",
    "rest of file",
    or similar text.

25. NEVER return a shortened BEFORE block that does not contain the exact source text.

26. NEVER escape or transform source formatting merely to make the JSON easier to read.

27. Return JSON only.

==================================================
PATCH SELECTION STRATEGY
==================================================

For every finding:

A. Locate the exact responsible code in the supplied PR HEAD.

B. Identify the smallest exact fragment responsible for the finding.

C. Copy that fragment character-for-character into BEFORE.

D. Construct the smallest replacement that resolves the finding.

E. Verify mentally that BEFORE occurs exactly in the supplied file.

F. Verify that AFTER differs from BEFORE.

G. Verify that AFTER directly addresses the finding.

Only then include the change.

==================================================
SECURITY RULES
==================================================

Security fixes take priority over convenience.

Never introduce:
- hardcoded secrets
- known default secrets
- disabled security flags
- authentication bypasses
- authorization bypasses
- unsafe production fallbacks
- credential exposure
- unnecessary permission increases

Do not weaken existing security controls to make a test or development environment work.

If a security finding says a security-sensitive boolean/value was changed unsafely, restore the safe value when that exact value is present in the PR HEAD.

Example:

PR HEAD:
httpOnly: false,

Finding:
session cookie is accessible to JavaScript.

Correct fix:

BEFORE:
httpOnly: false,

AFTER:
httpOnly: true,

==================================================
CHANGE SCOPE
==================================================

Prefer the smallest possible patch.

Good:

{
  "path": "app.js",
  "before": "    httpOnly: false,",
  "after": "    httpOnly: true,",
  "explanation": "Restores HttpOnly protection on the session cookie."
}

Bad:

{
  "path": "app.js",
  "before": "const sessionOptions = {...large block...}",
  "after": "...large rewritten block..."
}

The second approach is unsafe and MUST NOT be used when a smaller exact change is possible.

==================================================
WARNINGS
==================================================

Use warnings only for genuine limitations or risks.

Examples:
- supplied context is insufficient
- required dependency/API cannot be verified
- tests cannot be identified
- an additional security control needs human verification

Warnings MUST NOT be used as a substitute for making an obvious safe code change.

If the exact responsible code exists and can safely be changed, return the change even if other warnings exist.

==================================================
TEST PLAN
==================================================

Return practical tests for the proposed changes.

Do not invent test commands that are not present in the supplied context.

Treat placeholder or no-op test scripts as "no meaningful test suite configured". For example, commands such as echo "Error: no test specified" && exit 1, exit 1, or equivalent placeholder scripts MUST NOT be presented as a real test command.

If a test script exists but is only a placeholder/no-op, do not recommend running it as validation. Instead, state that no meaningful test suite is configured and describe the relevant verification that should be performed.

If exact test commands are unknown, describe the verification that should be performed rather than pretending tests were run.

Never claim that tests were executed unless test execution output is explicitly present in the supplied context.

==================================================
OUTPUT FORMAT
==================================================

Return exactly one JSON object:

{
  "summary": "short consolidated explanation",
  "risk": "LOW | MEDIUM | HIGH",
  "changes": [
    {
      "path": "exact file path",
      "explanation": "why this exact change resolves the finding",
      "before": "EXACT contiguous source from PR HEAD",
      "after": "complete replacement code"
    }
  ],
  "tests": [
    "verification step"
  ],
  "warnings": [
    "only genuine limitation or risk"
  ]
}

==================================================
FINAL VALIDATION BEFORE RESPONSE
==================================================

Before returning the JSON, verify every change:

- Is path an actual supplied PR HEAD file?
- Does BEFORE exist exactly?
- Is BEFORE contiguous?
- Is BEFORE the smallest practical fragment?
- Does AFTER differ?
- Does AFTER actually resolve the finding?
- Did you preserve indentation and line endings?
- Did you avoid unrelated refactoring?
- Are there overlapping changes?
- Did you accidentally replace a parent/container instead of the responsible value?
- Did you invent any source code?
- Did you use placeholders?

If any answer is NO, fix the change before returning it.

If an exact safe change cannot be produced, return an empty changes array and explain why in warnings.

DO NOT output markdown.
DO NOT output code fences.
DO NOT output commentary outside the JSON object.
`;
}

/* =========================================================
   FIX PLAN TYPES
========================================================= */

type RawFixChange = {
  path: string;
  explanation: string;
  before: string;
  after: string;
};

type NormalizedFixChange = {
  path: string;
  explanation: string;
  before: string;
  after: string;
};

type PRHeadFile = {
  path: string;
  content: string;
  sha: string;
};

/* =========================================================
   FIX RESPONSE PARSER
========================================================= */

function parsePRFix(
  response: string
): PRFix {
  try {
    if (
      !response ||
      typeof response !== "string"
    ) {
      throw new Error(
        "Empty AI response."
      );
    }

    let cleaned = response.trim();

    // Remove markdown fences if the model added them.
    cleaned = cleaned
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    // Extract JSON object if explanatory text was added.
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace === -1 ||
      lastBrace === -1 ||
      lastBrace <= firstBrace
    ) {
      throw new Error(
        "No JSON object found."
      );
    }

    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );

    const parsed = JSON.parse(cleaned);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      throw new Error(
        "Invalid JSON object."
      );
    }

    const validRisk =
      parsed.risk === "HIGH" ||
      parsed.risk === "MEDIUM" ||
      parsed.risk === "LOW"
        ? parsed.risk
        : "MEDIUM";

    let changes: RawFixChange[] = [];

    if (
      Array.isArray(parsed.changes)
    ) {
      changes = parsed.changes;
    } else if (
      typeof parsed.changes === "string"
    ) {
      try {
        const parsedChanges =
          JSON.parse(parsed.changes);

        if (
          Array.isArray(parsedChanges)
        ) {
          changes = parsedChanges;
        }
      } catch {
        changes = [];
      }
    }

    changes = changes
      .filter(
        (change: any) =>
          typeof change?.path ===
            "string" &&
          typeof change?.before ===
            "string" &&
          typeof change?.after ===
            "string"
      )
      .map((change: any) => ({
        path: change.path,
        explanation:
          typeof change.explanation ===
          "string"
            ? change.explanation
            : "Proposed code change.",
        before: change.before,
        after: change.after,
      }));

    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "No fix summary provided.",

      risk: validRisk,

      changes,

      tests: Array.isArray(parsed.tests)
        ? parsed.tests.filter(
            (test: unknown) =>
              typeof test === "string"
          )
        : [],

      warnings: Array.isArray(
        parsed.warnings
      )
        ? parsed.warnings.filter(
            (warning: unknown) =>
              typeof warning === "string"
          )
        : [],
    };
  } catch (error) {
    console.error(
      "PullPilot: failed to parse AI fix response:",
      error
    );

    console.error(
      "PullPilot: raw response:",
      response
    );

    return {
      summary:
        "AI returned an invalid fix response.",
      risk: "HIGH",
      changes: [],
      tests: [],
      warnings: [
        "The AI response could not be parsed safely.",
      ],
    };
  }
}

/* =========================================================
   PATH SAFETY
========================================================= */

function validateSafeRelativePath(
  path: string
): void {
  if (!path.trim()) {
    throw new Error(
      "AI fix contains an empty file path."
    );
  }

  if (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(path)
  ) {
    throw new Error(
      `Unsafe file path rejected: ${path}`
    );
  }

  const normalizedPath =
    path.replace(/\\/g, "/");

  if (
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../")
  ) {
    throw new Error(
      `Unsafe file path rejected: ${path}`
    );
  }
}

/* =========================================================
   STRING OCCURRENCE HELPERS
========================================================= */

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return (
    startA < endB &&
    startB < endA
  );
}

function findAllOccurrences(
  content: string,
  search: string
): number[] {
  const positions: number[] = [];

  if (!search) {
    return positions;
  }

  let offset = 0;

  while (true) {
    const index =
      content.indexOf(
        search,
        offset
      );

    if (index === -1) {
      break;
    }

    positions.push(index);

    offset =
      index +
      Math.max(search.length, 1);
  }

  return positions;
}

/* =========================================================
   CONSOLIDATE SAME-FILE CHANGES
========================================================= */

function consolidateChangesForFile(
  path: string,
  originalContent: string,
  changes: RawFixChange[]
): NormalizedFixChange {
  if (changes.length === 0) {
    throw new Error(
      `No changes supplied for ${path}.`
    );
  }

  const prepared = changes.map(
    (change, index) => {
      if (
        typeof change.before !==
          "string" ||
        typeof change.after !==
          "string"
      ) {
        throw new Error(
          `Invalid change ${
            index + 1
          } for ${path}.`
        );
      }

      if (!change.before.trim()) {
        throw new Error(
          `AI fix contains an empty "before" block for ${path}.`
        );
      }

      const occurrences =
        findAllOccurrences(
          originalContent,
          change.before
        );

      if (occurrences.length === 0) {
        throw new Error(
          `Safety check failed for ${path}: expected code was not found in the PR HEAD.`
        );
      }

      if (occurrences.length !== 1) {
        throw new Error(
          `Safety check failed for ${path}: expected code occurs ${occurrences.length} times.`
        );
      }

      const start =
        occurrences[0];

      if (start === undefined) {
        throw new Error(
          `Safety check failed for ${path}: unable to determine the exact location of the BEFORE block.`
        );
      }

      const end =
        start + change.before.length;

      return {
        ...change,
        start,
        end,
      };
    }
  );

  // Reject overlapping changes before applying anything.
  const sortedByStart = [
    ...prepared,
  ].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }

    return b.end - a.end;
  });

  for (
    let index = 1;
    index < sortedByStart.length;
    index++
  ) {
    const previous =
      sortedByStart[index - 1];

    const current =
      sortedByStart[index];

    if (
      !previous ||
      !current
    ) {
      continue;
    }

    if (
      rangesOverlap(
        previous.start,
        previous.end,
        current.start,
        current.end
      )
    ) {
      throw new Error(
        `Unsafe overlapping AI changes detected for ${path}. PullPilot rejected the fix plan before modifying GitHub.`
      );
    }
  }

  // Apply changes from bottom to top so offsets remain valid.
  const descending = [
    ...prepared,
  ].sort(
    (a, b) =>
      b.start - a.start
  );

  let updatedContent =
    originalContent;

  for (const change of descending) {
    updatedContent =
      updatedContent.slice(
        0,
        change.start
      ) +
      change.after +
      updatedContent.slice(
        change.end
      );
  }

  if (
    updatedContent ===
    originalContent
  ) {
    throw new Error(
      `Safety check failed for ${path}: proposed changes would not modify the file.`
    );
  }

  const explanations = changes
    .map((change) =>
      change.explanation.trim()
    )
    .filter(Boolean);

  return {
    path,

    explanation:
      explanations.length === 1
        ? explanations[0]!
        : `Consolidated ${changes.length} safe changes for ${path}: ${explanations.join(
            " "
          )}`,

    before: originalContent,

    after: updatedContent,
  };
}

/* =========================================================
   VALIDATE + CONSOLIDATE COMPLETE FIX PLAN
========================================================= */

async function prepareValidatedFixPlan(
  owner: string,
  repo: string,
  pr: any,
  fix: PRFix
): Promise<{
  changes: NormalizedFixChange[];
  deletions: Array<{
    path: string;
    explanation: string;
    before: string;
  }>;
  warnings: string[];
}> {
  if (
    !fix ||
    typeof fix !== "object"
  ) {
    throw new Error(
      "Invalid AI fix."
    );
  }

  if (
    !Array.isArray(fix.changes) ||
    fix.changes.length === 0
  ) {
    throw new Error(
      "No AI-generated changes available."
    );
  }

  // Only files from the original PR may be modified.
  const prPaths =
    new Set<string>(
      Array.isArray(pr.files)
        ? pr.files.map(
            (file: any) =>
              file.path
          )
        : []
    );

    const hasIntentionalCIFailureFixture =
  Array.isArray(pr.files) &&
  pr.files.some(
    (file: any) =>
      file?.path === ".github/workflows/ci.yml" &&
      typeof file?.patch === "string" &&
      file.patch.includes("PullPilot CI Failure Fixture")
  );

const protectedFixturePaths = new Set<string>();

if (hasIntentionalCIFailureFixture) {
  protectedFixturePaths.add(".github/workflows/ci.yml");
}


  // Group AI changes by file.
  const changesByFile = new Map<string, RawFixChange[]>();

for (const change of fix.changes) {
    if (
      change &&
      typeof change === "object" &&
      protectedFixturePaths.has(change.path)
    ) {
      throw new Error(
  `Protected fixture change detected: ${change.path}`
);
      continue;
    }

    if (
      !change ||
      typeof change !== "object"
    ) {
      throw new Error(
        "AI fix contains an invalid change object."
      );
    }

    if (
      typeof change.path !==
        "string" ||
      typeof change.before !==
        "string" ||
      typeof change.after !==
        "string"
    ) {
       throw new Error(
        "Every AI change requires path, before and after."
      );
    }

    validateSafeRelativePath(
      change.path
    );

    if (!change.before.trim()) {
      throw new Error(
        `AI fix contains an empty "before" block for ${change.path}.`
      );
    }

    if (!prPaths.has(change.path)) {
      throw new Error(
        `Safety check failed: ${change.path} was not part of the original PR. PullPilot will not modify or create unrelated files.`
      );
    }

    const existing =
      changesByFile.get(
        change.path
      ) ?? [];

    existing.push(change);

    changesByFile.set(
      change.path,
      existing
    );
  }

  const validatedChanges: NormalizedFixChange[] =
    [];

    // =========================================================
  // CHANGE SCOPE SAFETY
  // =========================================================
  // The AI must not broaden a finding into unrelated
  // configuration changes. For the known session-cookie
  // regression, only the httpOnly change is allowed.
  for (const [path, fileChanges] of changesByFile.entries()) {
    if (path !== "app.js") {
      continue;
    }

    const hasHttpOnlyFinding =
      JSON.stringify(fix).toLowerCase().includes("httponly");

    if (!hasHttpOnlyFinding) {
      continue;
    }

    for (const change of fileChanges) {
      const before = change.before.toLowerCase();
      const after = change.after.toLowerCase();

      const touchesHttpOnly =
        before.includes("httponly") ||
        after.includes("httponly");

      const touchesSecure =
        before.includes("secure") ||
        after.includes("secure");

      const touchesSameSite =
        before.includes("samesite") ||
        after.includes("samesite");

      if (
        (touchesSecure || touchesSameSite) &&
        !touchesHttpOnly
      ) {
        throw new Error(
          `Safety check failed for ${path}: AI fix broadened the requested session-cookie change beyond the httpOnly finding. PullPilot refused unrelated secure/sameSite changes.`
        );
      }
    }
  }
  const deletions: Array<{
    path: string;
    explanation: string;
    before: string;
  }> = [];

  const warnings: string[] = [];

  // Fetch the PR HEAD snapshot once per target file.
  const headFiles = new Map<string, PRHeadFile>();

  for (
    const path of changesByFile.keys()
  ) {
    const file =
      await getRepositoryFile(
        owner,
        repo,
        path,
        pr.headSha
      );

    headFiles.set(path, {
      path,
      content: file.content,
      sha: file.sha,
    });
  }

  // Validate every file against the SAME PR HEAD snapshot.
  for (
    const [
      path,
      fileChanges,
    ] of changesByFile.entries()
  ) {
    const file =
      headFiles.get(path);

    if (!file) {
      throw new Error(
        `Safety check failed: unable to retrieve ${path} from the PR HEAD.`
      );
    }

    const deletionChanges =
      fileChanges.filter(
        (change) =>
          change.after === ""
      );

    // File deletion is only allowed as a single operation.
    if (
      deletionChanges.length > 0
    ) {
      if (
        fileChanges.length !== 1
      ) {
        throw new Error(
          `Unsafe fix plan for ${path}: a file deletion cannot be combined with other changes.`
        );
      }

      const deletion =
        deletionChanges[0];

      if (!deletion) {
        throw new Error(
          `Unable to process deletion for ${path}.`
        );
      }

      const occurrences =
        findAllOccurrences(
          file.content,
          deletion.before
        );

      if (occurrences.length === 0) {
        throw new Error(
          `Safety check failed for ${path}: expected deletion code was not found in the PR HEAD.`
        );
      }

      if (occurrences.length !== 1) {
        throw new Error(
          `Safety check failed for ${path}: expected deletion code occurs ${occurrences.length} times.`
        );
      }

      // Whole-file deletion is the only supported deletion form.
      if (
        file.content !==
        deletion.before
      ) {
        throw new Error(
          `Safety check failed for ${path}: deletion target must exactly match the entire PR HEAD file.`
        );
      }

      deletions.push({
        path,
        explanation:
          deletion.explanation,
        before:
          deletion.before,
      });

      continue;
    }

    const consolidated =
      consolidateChangesForFile(
        path,
        file.content,
        fileChanges
      );

    validatedChanges.push(
      consolidated
    );
  }

  if (
    Array.isArray(fix.warnings)
  ) {
    warnings.push(
      ...fix.warnings.filter(
        (warning) =>
          typeof warning === "string"
      )
    );
  }

  return {
    changes: validatedChanges,
    deletions,
    warnings,
  };
}

/* =========================================================
   NORMALIZE FIX PATHS (SAFE PATH RESOLVER)
========================================================= */

function normalizePRFixPaths(
  fix: PRFix,
  fileContents: Array<{
    path: string;
    content: string;
  }>
): PRFix {
  const normalizedChanges: RawFixChange[] = [];

  for (const change of fix.changes) {
    if (
      typeof change.path === "string" &&
      change.path.trim()
    ) {
      normalizedChanges.push(change);
      continue;
    }

    if (
      typeof change.before !== "string" ||
      !change.before.trim()
    ) {
      throw new Error(
        "AI fix omitted path and provided no usable BEFORE block for safe path resolution."
      );
    }

    const matches = fileContents.filter(
      (file) =>
        findAllOccurrences(
          file.content,
          change.before
        ).length === 1
    );

    if (matches.length === 0) {
      throw new Error(
        `AI fix omitted path and its BEFORE block could not be uniquely located in the supplied PR HEAD files.`
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `AI fix omitted path and its BEFORE block matches multiple PR HEAD files. PullPilot will not guess the target file.`
      );
    }

    const matchedFile = matches[0];

    if (!matchedFile) {
      throw new Error(
        "Unable to safely resolve the AI fix file path."
      );
    }

    normalizedChanges.push({
      ...change,
      path: matchedFile.path,
    });
  }

  return {
    ...fix,
    changes: normalizedChanges,
  };
}

/* =========================================================
   GENERATE ALL PR FIXES
========================================================= */

export async function generatePRFixes(
  owner: string,
  repo: string,
  number: number,
  findings: Array<{
    category: string;
    finding: string;
  }>
): Promise<PRFix> {
  const pr =
    await getPullRequest(
      owner,
      repo,
      number
    );

  if (!pr.headSha) {
    throw new Error(
      "PR head SHA is missing."
    );
  }

  if (
    !Array.isArray(findings) ||
    findings.length === 0
  ) {
    throw new Error(
      "At least one finding is required."
    );
  }

  const fileContents: Array<{
  path: string;
  content: string;
}> = [];

const contextFailures: string[] = [];

for (const file of pr.files) {
  // Removed files do not exist at PR HEAD.
  // They must not be fetched as normal source files.
  if (file.status === "removed") {
    continue;
  }

  try {
    const repositoryFile = await getRepositoryFile(
      owner,
      repo,
      file.path,
      pr.headSha
    );

    fileContents.push({
      path: repositoryFile.path,
      content: repositoryFile.content,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown GitHub file retrieval error.";

    contextFailures.push(
      `${file.path}: ${message}`
    );
  }
}

if (contextFailures.length > 0) {
  throw new Error(
    `Unable to build a complete PR HEAD file context. ` +
      `Fix generation was stopped because the following files could not be retrieved:\n` +
      contextFailures
        .map((failure) => `- ${failure}`)
        .join("\n")
  );
}

if (fileContents.length === 0) {
  throw new Error(
    `No usable PR HEAD file contents were available for PR #${number}. ` +
      `Fix generation cannot continue safely.`
  );
}

  const prompt =
    buildFixPrompt(
      owner,
      repo,
      number,
      pr,
      findings,
      fileContents
    );

  const provider =
    new OpenRouterProvider();

  const response =
    await provider.generateFix(
      prompt
    );

  console.log(
    "========== RAW AI ALL-FIX RESPONSE =========="
  );

  console.log(response);

  console.log(
    "============================================="
  );

  const parsed =
  parsePRFix(response);

const normalizedFix =
  normalizePRFixPaths(
    parsed,
    fileContents
  );

// Validate before returning the plan.
try {
  const prepared =
    await prepareValidatedFixPlan(
      owner,
      repo,
      pr,
      normalizedFix
    );

  const preparedChanges =
    prepared.changes.map(
      (change) => ({
        path: change.path,
        explanation:
          change.explanation,
        before: change.before,
        after: change.after,
      })
    );

  const preparedDeletions =
    prepared.deletions.map(
      (deletion) => ({
        path: deletion.path,
        explanation:
          deletion.explanation,
        before: deletion.before,
        after: "",
      })
    );

  return {
    ...normalizedFix,

    changes: [
      ...preparedChanges,
      ...preparedDeletions,
    ],

    warnings:
      prepared.warnings,
  };
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Generated fix plan failed safety validation.";

  console.warn(
    "PullPilot: generated fix plan rejected before apply:",
    message
  );

  return {
    ...normalizedFix,

    changes: [],

    warnings: [
      ...parsed.warnings,
      `Fix plan rejected during pre-validation: ${message}`,
    ],
  };
}
}

/* =========================================================
   SINGLE FIX GENERATOR
========================================================= */

export async function generatePRFix(
  owner: string,
  repo: string,
  number: number,
  category: string,
  finding: string
): Promise<PRFix> {
  return generatePRFixes(
    owner,
    repo,
    number,
    [
      {
        category,
        finding,
      },
    ]
  );
}

/* =========================================================
   MERGEABILITY POLLING
========================================================= */

async function waitForMergeability(
  owner: string,
  repo: string,
  pullNumber: number,
  executionId?: string,
  options: {
    attempts?: number;
    delayMs?: number;
  } = {}
): Promise<GitHubMergeability> {
  const attempts =
    options.attempts ?? 5;

  const delayMs =
    options.delayMs ?? 2000;

    let lastResult:
    | Awaited<
        ReturnType<
          typeof checkPullRequestMergeability
        >
      >
    | undefined;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    checkExecutionCancelled(
      executionId
    );

    lastResult =
      await checkPullRequestMergeability(
        owner,
        repo,
        pullNumber
      );

    console.log(
      `🧪 PullPilot: mergeability check ${attempt}/${attempts}`,
      lastResult
    );

    if (
      lastResult &&
      lastResult.mergeable !== null &&
      lastResult.mergeableState !==
        "unknown"
    ) {
      return lastResult;
    }

    if (attempt < attempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );

      checkExecutionCancelled(
        executionId
      );
    }
  }

  if (!lastResult) {
    throw new Error(
      "Unable to determine GitHub pull request mergeability."
    );
  }

  return lastResult;
}

/* =========================================================
   CI CHECKS POLLING
========================================================= */

async function waitForChecks(
  owner: string,
  repo: string,
  ref: string,
  executionId?: string,
  options: {
    attempts?: number;
    delayMs?: number;
  } = {}
): Promise<
  Awaited<
    ReturnType<typeof checkPullRequestChecks>
  >
> {
  const attempts =
    options.attempts ?? 10;

  const delayMs =
    options.delayMs ?? 5000;

  let lastResult:
    | Awaited<
        ReturnType<
          typeof checkPullRequestChecks
        >
      >
    | undefined;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    checkExecutionCancelled(
      executionId
    );

    lastResult =
      await checkPullRequestChecks(
        owner,
        repo,
        ref
      );

    console.log(
      `🧪 PullPilot: CI check ${attempt}/${attempts}`,
      lastResult
    );

    if (
      lastResult &&
      lastResult.total === 0
    ) {
      return lastResult;
    }

    if (
      lastResult &&
      lastResult.pending === 0
    ) {
      return lastResult;
    }

    if (attempt < attempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );

      checkExecutionCancelled(
        executionId
      );
    }
  }

  if (!lastResult) {
    throw new Error(
      "Unable to determine CI check status."
    );
  }

  return lastResult;
}

/* =========================================================
   APPLY PR FIX
========================================================= */

export async function applyPRFix(
  owner: string,
  repo: string,
  number: number,
  fix: PRFix,
  mode: PRExecutionMode = "human",
executionId?: string,
forceMerge: boolean = false
) {
  try {
    /* -------------------------------------------------------
       1. Validate incoming fix
    ------------------------------------------------------- */

    if (
      !fix ||
      typeof fix !== "object"
    ) {
      throw new Error(
        "Invalid AI fix."
      );
    }

    if (
      !Array.isArray(fix.changes) ||
      fix.changes.length === 0
    ) {
      throw new Error(
        "No AI-generated changes available."
      );
    }

    for (const change of fix.changes) {
      if (
        typeof change?.path !==
          "string" ||
        typeof change?.before !==
          "string" ||
        typeof change?.after !==
          "string"
      ) {
        throw new Error(
          "Every AI change requires path, before and after."
        );
      }

      validateSafeRelativePath(
        change.path
      );

      if (!change.before.trim()) {
        throw new Error(
          `AI fix contains an empty "before" block for ${change.path}.`
        );
      }
    }

    /* -------------------------------------------------------
       2. Fetch original PR
    ------------------------------------------------------- */

    const pr =
      await getPullRequest(
        owner,
        repo,
        number
      );

    if (!pr.headSha) {
      throw new Error(
        "PR head SHA is missing."
      );
    }

    if (!pr.baseBranch) {
      throw new Error(
        "PR base branch is missing."
      );
    }

    if (!pr.headBranch) {
      throw new Error(
        "PR head branch is missing."
      );
    }

    checkExecutionCancelled(
      executionId
    );

    /* -------------------------------------------------------
       3. Revalidate complete fix against CURRENT PR HEAD
    ------------------------------------------------------- */

    const prepared =
      await prepareValidatedFixPlan(
        owner,
        repo,
        pr,
        fix
      );

    const validatedChanges =
      prepared.changes.map(
        (change) => ({
          path: change.path,
          explanation:
            change.explanation,
          before: change.before,
          after: change.after,
          content: change.after,
          sha: "",
        })
      );

    /*
     * The consolidated BEFORE is the complete original
     * file content. Verify that exact snapshot again.
     */
    for (
      const change of validatedChanges
    ) {
      checkExecutionCancelled(
        executionId
      );

      const currentFile =
        await getRepositoryFile(
          owner,
          repo,
          change.path,
          pr.headSha
        );

      if (
        currentFile.content !==
        change.before
      ) {
        throw new Error(
          `Safety check failed for ${change.path}: PR HEAD changed after the fix plan was generated. PullPilot refused to apply a stale fix plan.`
        );
      }

      change.sha =
        currentFile.sha;

      if (
        change.content ===
        currentFile.content
      ) {
        throw new Error(
          `Safety check failed for ${change.path}: proposed fix does not change the file.`
        );
      }
    }

    /* -------------------------------------------------------
       4. Validate deletions
    ------------------------------------------------------- */

    const validatedDeletions: Array<{
      path: string;
      explanation: string;
      sha: string;
    }> = [];

    for (
      const deletion of
        prepared.deletions
    ) {
      checkExecutionCancelled(
        executionId
      );

      const currentFile =
        await getRepositoryFile(
          owner,
          repo,
          deletion.path,
          pr.headSha
        );

      const occurrences =
        findAllOccurrences(
          currentFile.content,
          deletion.before
        );

      if (
        occurrences.length !== 1
      ) {
        throw new Error(
          `Safety check failed for ${deletion.path}: deletion target does not occur exactly once in the PR HEAD.`
        );
      }

      if (
        currentFile.content !==
        deletion.before
      ) {
        throw new Error(
          `Safety check failed for ${deletion.path}: whole-file deletion target does not exactly match the current PR HEAD.`
        );
      }

      validatedDeletions.push({
        path: deletion.path,
        explanation:
          deletion.explanation,
        sha: currentFile.sha,
      });
    }
    /* -------------------------------------------------------
   5. AUTONOMOUS WARNING CONFIRMATION
------------------------------------------------------- */

if (
  mode === "autonomous" &&
  fix.warnings.length > 0 &&
  !forceMerge
) {
  console.log(
    "⚠️ PullPilot: autonomous execution requires warning confirmation."
  );

  return {
    success: false,
    mode,
    stage: "AWAITING_DANGEROUS_CONFIRMATION",
    message:
      "Autonomous execution was paused because the fix engine returned warnings. User confirmation is required before continuing.",
    originalPR: number,
    sourceBranch: pr.headBranch,
    merged: false,
    automaticMerge: false,
    safety: "SUSPICIOUS",
    requiresConfirmation: true,
    warnings: [
      "Autonomous merge is paused because the fix engine returned warnings.",
      ...fix.warnings,
      "Choose STOP & REVIEW to cancel, or MUST MERGE ANYWAY to continue.",
    ],
  };
}

    /* -------------------------------------------------------
       5. Create unique fix branch from ORIGINAL PR HEAD
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    const branchName =
      `pullpilot/fix-pr-${number}-${Date.now()}`;

    await createBranch(
      owner,
      repo,
      branchName,
      pr.headSha
    );


    /* -------------------------------------------------------
       6. Apply validated changes
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    const deletionCommits: Array<{
      path: string;
      commitSha: string;
    }> = [];

    /*
     * Important:
     * Content changes are committed first.
     *
     * This keeps createCommitWithFiles based on the
     * exact branch starting SHA.
     */
    let commitResult:
      | { commitSha: string }
      | undefined;

    if (
      validatedChanges.length > 0
    ) {
      checkExecutionCancelled(
        executionId
      );

      commitResult =
        await createCommitWithFiles(
          owner,
          repo,
          branchName,
          pr.headSha,
          validatedChanges.map(
            (change) => ({
              path: change.path,
              content:
                change.content,
            })
          ),
          `fix: apply PullPilot AI fix for PR #${number}`
        );
    }

    /*
     * Deletions are applied after the content commit.
     *
     * Each deletion uses its current file SHA.
     */
    for (
      const deletion of
        validatedDeletions
    ) {
      checkExecutionCancelled(
        executionId
      );

      const branchFile =
        await getRepositoryFile(
          owner,
          repo,
          deletion.path,
          branchName
        );

      const deleteResult =
        await deleteRepositoryFile(
          owner,
          repo,
          deletion.path,
          branchName,
          branchFile.sha,
          `fix: delete ${deletion.path} per PullPilot AI fix for PR #${number}`
        );

      deletionCommits.push({
        path: deletion.path,
        commitSha:
          deleteResult.commitSha,
      });
    }

    /* -------------------------------------------------------
       7. VERIFY FIX BRANCH
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    console.log(
      `🧪 PullPilot: verifying fix branch ${branchName}`
    );

    const verification =
      await verifyPRBranch(
        owner,
        repo,
        branchName
      );

    const allChangesApplied = [
      ...validatedChanges.map(
        (change) => ({
          path: change.path,
          explanation:
            change.explanation,
        })
      ),

      ...validatedDeletions.map(
        (deletion) => ({
          path: deletion.path,
          explanation:
            deletion.explanation,
        })
      ),
    ];

    const allCommits = [
      ...(commitResult
        ? validatedChanges.map(
            (change) => ({
              path: change.path,
              commitSha:
                commitResult!.commitSha,
            })
          )
        : []),

      ...deletionCommits,
    ];

    if (
      !verification.success
    ) {
      return {
        success: false,
        mode,
        stage: "VERIFICATION_FAILED",
        message:
          "PullPilot generated the fix, but repository verification failed. No review PR was created.",
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: undefined,
        merged: false,
        automaticMerge: false,
        warnings: [
          "PullPilot generated and committed the fix, but verification failed.",
          "The fix branch was NOT opened as a Pull Request.",
        ],
      };
    }

    /* -------------------------------------------------------
       8. Re-check original PR HEAD before creating review PR
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    const latestPR =
      await getPullRequest(
        owner,
        repo,
        number
      );

    if (!latestPR.headSha) {
      throw new Error(
        "Safety check failed: original PR HEAD SHA is missing."
      );
    }

    if (latestPR.headSha !== pr.headSha) {
      throw new Error(
        `Safety check failed: original PR changed while PullPilot was applying the fix. ` +
        `Expected PR HEAD ${pr.headSha}, but GitHub now reports ${latestPR.headSha}. ` +
        `PullPilot refused to create a fix PR from a stale PR HEAD.`
      );
    }

    if (latestPR.headBranch !== pr.headBranch) {
      throw new Error(
        `Safety check failed: original PR head branch changed from ${pr.headBranch} to ${latestPR.headBranch}.`
      );
    }

    /* -------------------------------------------------------
       9. VERIFY FIX BRANCH ANCESTRY
    ------------------------------------------------------- */

    checkExecutionCancelled(executionId);

    const branchComparison = await compareBranches(
      owner,
      repo,
      latestPR.headBranch,
      branchName
    );

    console.log(
      "PullPilot branch ancestry check:",
      branchComparison
    );

    if (
      branchComparison.status !== "ahead" ||
      branchComparison.aheadBy < 1 ||
      branchComparison.behindBy !== 0
    ) {
      throw new Error(
        `Safety check failed: fix branch ${branchName} is not cleanly stacked on ${latestPR.headBranch}. ` +
          `Expected status=ahead, aheadBy>=1, behindBy=0. ` +
          `Received status=${branchComparison.status}, ` +
          `aheadBy=${branchComparison.aheadBy}, ` +
          `behindBy=${branchComparison.behindBy}. ` +
          `PullPilot refused to create the review PR.`
      );
    }

    /* -------------------------------------------------------
       10. Create review PR
    ------------------------------------------------------- */

    const fixPR =
      await createPullRequest(
        owner,
        repo,
        `fix: PullPilot AI fix for PR #${number}`,
        [
          "## PullPilot AI Fix",
          "",
          `Automatically generated fix for PR #${number}.`,
          "",
          "### Summary",
          fix.summary,
          "",
          "### Risk",
          fix.risk,
          "",
          "### Changes",

          ...validatedChanges.map(
            (change) =>
              `- \`${change.path}\` — ${change.explanation}`
          ),

          ...validatedDeletions.map(
            (deletion) =>
              `- \`${deletion.path}\` — deleted — ${deletion.explanation}`
          ),

          "",
          "### Tests",

          ...(fix.tests.length > 0
            ? fix.tests.map(
                (test) =>
                  `- ${test}`
              )
            : [
                "- No tests specified by AI.",
              ]),

          "",
          "### Warnings",

          ...(fix.warnings.length > 0
            ? fix.warnings.map(
                (warning) =>
                  `- ${warning}`
              )
            : ["- None"]),

          "",
          "### PullPilot Safety Checks",
          "- Exact BEFORE code verified",
          "- Every target file verified before modification",
          "- Changes applied from PR HEAD",
          "- Same-file changes consolidated before application",
          "- No unrelated files modified",
          "",
          "Generated by PullPilot AI.",
        ].join("\n"),
        branchName,
        latestPR.headBranch
      );

    /* -------------------------------------------------------
       11. CHECK MERGEABILITY
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    console.log(
      `🔍 PullPilot: checking mergeability of PR #${fixPR.number}`
    );

    const mergeability =
      await waitForMergeability(
        owner,
        repo,
        fixPR.number,
        executionId
      );

    console.log(
      "PullPilot mergeability:",
      mergeability
    );

    /* -------------------------------------------------------
       12. MERGEABILITY SAFETY GATE
    ------------------------------------------------------- */

    if (
      mergeability.mergeable ===
      false
    ) {
      console.log(
        `🛑 PullPilot: fix PR #${fixPR.number} is not mergeable.`,
        mergeability.mergeableState
      );

      if (mode === "human") {
        return {
          success: true,
          mode,
          stage: "REVIEW_PR_CREATED",
          message:
            "Human-Controlled execution completed. The fix PR was created successfully and is waiting for human review.",
          url: fixPR.url,
          originalPR: number,
          sourceBranch: pr.headBranch,
          fixBranch: branchName,
          commits: allCommits,
          changesApplied: allChangesApplied,
          verification,
          pullRequest: fixPR,
          mergeability,
          merged: false,
          automaticMerge: false,
          safety: "SUSPICIOUS",
          warnings: [
            "The fix PR was created successfully, but GitHub reports that it currently has merge conflicts.",
            "PullPilot will not modify or automatically resolve merge conflicts in Human-Controlled mode.",
            "Human review is required to resolve the conflict before merging.",
          ],
        };
      }

      return {
        success: false,
        mode,
        stage: "MERGEABILITY",
        message:
          "Autonomous execution was blocked because the generated fix PR is not mergeable.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "DANGEROUS",
        warnings: [
          "Autonomous merge was blocked because GitHub reports that the fix PR has merge conflicts.",
          `GitHub mergeability state: ${mergeability.mergeableState}.`,
          "PullPilot will not automatically resolve merge conflicts.",
          "No automatic merge was performed.",
          "Human review is required before this fix PR can be merged.",
        ],
      };
    }

    /* -------------------------------------------------------
       13. UNKNOWN MERGEABILITY SAFETY GATE
    ------------------------------------------------------- */

    if (
      mergeability.mergeable ===
        null ||
      mergeability.mergeableState ===
        "unknown"
    ) {
      console.log(
        "🛑 PullPilot: GitHub could not safely establish mergeability."
      );

      if (mode === "human") {
        return {
          success: true,
          mode,
          stage: "REVIEW_PR_CREATED",
          message:
            "Human-Controlled execution completed. The fix PR was created, but GitHub could not safely establish mergeability yet.",
          url: fixPR.url,
          originalPR: number,
          sourceBranch: pr.headBranch,
          fixBranch: branchName,
          commits: allCommits,
          changesApplied: allChangesApplied,
          verification,
          pullRequest: fixPR,
          mergeability,
          merged: false,
          automaticMerge: false,
          safety: "SUSPICIOUS",
          warnings: [
            "The fix PR was created successfully, but GitHub could not safely establish its mergeability.",
            "PullPilot will not make an automatic merge decision while mergeability is unknown.",
            "Human review is required.",
          ],
        };
      }

      return {
        success: false,
        mode,
        stage: "MERGEABILITY",
        message:
          "Autonomous execution was blocked because GitHub could not safely establish mergeability.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Autonomous merge was blocked because GitHub could not safely establish mergeability.",
          "PullPilot will not automatically merge while mergeability is unknown.",
          "No automatic merge was performed.",
          "Human review is required.",
        ],
      };
    }

    console.log(
      `✅ PullPilot: fix PR #${fixPR.number} is mergeable.`
    );

    /* -------------------------------------------------------
       14. HUMAN-CONTROLLED MODE
    ------------------------------------------------------- */

    if (mode === "human") {
      return {
        success: true,
        mode,
        stage: "REVIEW_PR_CREATED",
        message:
          "Human-Controlled execution completed. The fix PR was created successfully and is waiting for human approval.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SAFE",
        warnings: [
          "Human-Controlled mode is enabled.",
          "PullPilot will not automatically merge the fix PR.",
          "Human approval is required before merging.",
        ],
      };
    }

    /* -------------------------------------------------------
       15. AUTONOMOUS HIGH-RISK GATE
    ------------------------------------------------------- */

if (fix.risk === "HIGH" && !forceMerge) {
        return {
        success: false,
        mode,
        stage: "SAFETY_GATE",
        message:
          "Autonomous execution was blocked because the generated fix is HIGH risk.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "DANGEROUS",
        warnings: [
          "Autonomous merge blocked because the generated fix is HIGH risk.",
          "Human review is required before merging.",
        ],
      };
    }

    /* -------------------------------------------------------
       17. AUTONOMOUS CI GATE
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    console.log(
      `🧪 PullPilot: checking CI status for ${branchName}`
    );

    const checks =
      await waitForChecks(
        owner,
        repo,
        branchName,
        executionId
      );

    console.log(
      "PullPilot CI checks:",
      checks
    );

    if (
      checks.total === 0
    ) {
      return {
        success: false,
        mode,
        stage: "CI",
        message:
          "Autonomous execution was blocked because no CI checks were found for the fix branch.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Autonomous merge blocked because no CI checks were found for the fix branch.",
          "Human review is required before merging.",
        ],
      };
    }

    if (
      checks.pending > 0
    ) {
      return {
        success: false,
        mode,
        stage: "CI",
        message:
          "Autonomous execution was blocked because CI checks are still pending.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Autonomous merge blocked because CI checks are still pending.",
          "Human review is required before merging.",
        ],
      };
    }

    if (
      checks.failed > 0
    ) {
      return {
        success: false,
        mode,
        stage: "CI",
        message:
          "Autonomous execution was blocked because CI checks failed.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch:
          pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied:
          allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "DANGEROUS",
        warnings: [
          "Autonomous merge blocked because CI checks failed.",
          "Human review is required before merging.",
        ],
      };
    }

    /* -------------------------------------------------------
       18. FINAL CANCELLATION CHECK
    ------------------------------------------------------- */

    checkExecutionCancelled(
      executionId
    );

    /* -------------------------------------------------------
       19. AUTONOMOUS MERGE
    ------------------------------------------------------- */

    const mergeResult = await mergePullRequest(
      owner,
      repo,
      fixPR.number
    );

    if (!mergeResult.merged) {
      return {
        success: false,
        mode,
        stage: "MERGE",
        message:
          "Autonomous merge was attempted but GitHub did not merge the review PR.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch: pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied: allChangesApplied,
        verification,
        pullRequest: fixPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Autonomous merge was attempted but GitHub did not merge the review PR.",
          mergeResult.message,
        ],
      };
    }

    /*
     * IMPORTANT:
     * GitHub accepting the merge request is not enough proof.
     * Re-fetch the PR and verify that GitHub now reports it as
     * actually merged and provides a merge commit SHA.
     */
    const mergedPR = await getPullRequest(
      owner,
      repo,
      fixPR.number
    );

    if (!mergedPR.merged) {
      return {
        success: false,
        mode,
        stage: "MERGE_VERIFICATION",
        message:
          "GitHub accepted the merge request, but PullPilot could not confirm that the review PR was actually merged.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch: pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied: allChangesApplied,
        verification,
        pullRequest: mergedPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Automatic merge completion was not confirmed by GitHub.",
          "PullPilot will not report the execution as successfully merged without verified PR state.",
        ],
      };
    }

    const verifiedMergeSha =
      mergedPR.mergeCommitSha ?? mergeResult.sha;

    if (!verifiedMergeSha) {
      return {
        success: false,
        mode,
        stage: "MERGE_VERIFICATION",
        message:
          "GitHub reports the review PR as merged, but PullPilot could not obtain the merge commit SHA required to prove the merge.",
        url: fixPR.url,
        originalPR: number,
        sourceBranch: pr.headBranch,
        fixBranch: branchName,
        commits: allCommits,
        changesApplied: allChangesApplied,
        verification,
        pullRequest: mergedPR,
        mergeability,
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "The review PR appears merged, but no merge commit SHA was available.",
          "PullPilot refused to claim automatic completion without commit proof.",
        ],
      };
    }

    return {
      success: true,
      mode,
      stage: "MERGED",
      message:
        "Autonomous execution completed successfully. The fix PR was validated, merged, and verified on GitHub.",
      url: fixPR.url,
      originalPR: number,
      sourceBranch: pr.headBranch,
      fixBranch: branchName,
      commits: allCommits,
      changesApplied: allChangesApplied,
      verification,
      pullRequest: mergedPR,
      mergeability,
      merged: true,
      automaticMerge: true,
      mergeSha: verifiedMergeSha,
      mergedAt: mergedPR.mergedAt,
      safety: "SAFE",
      warnings: [],
    };
  } catch (error) {
    /* -------------------------------------------------------
       CONTROLLED CANCELLATION RESULT
    ------------------------------------------------------- */

    if (
      error instanceof Error &&
      error.message ===
        "AUTONOMOUS_EXECUTION_CANCELLED"
    ) {
      return {
        success: false,
        mode,
        stage: "CANCELLED",
        message:
          "Autonomous execution was cancelled. No further operation was performed.",
        merged: false,
        automaticMerge: false,
        safety: "SUSPICIOUS",
        warnings: [
          "Autonomous execution was cancelled. No further operation was performed.",
        ],
      };
    }

    throw error;
  }
}
