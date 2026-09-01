import {
  analyzePullRequest,
  generatePRFix,
  applyPRFix,
} from "@pullpilot/repository-brain";

/* =========================================================
   ANALYZE PR
========================================================= */

export async function analyzePRService(
  owner: string,
  repo: string,
  number: number
) {
  return analyzePullRequest(
    owner,
    repo,
    number
  );
}

/* =========================================================
   GENERATE FIX
========================================================= */

export async function generatePRFixService(
  owner: string,
  repo: string,
  number: number,
  category: string,
  finding: string
) {
  return generatePRFix(
    owner,
    repo,
    number,
    category,
    finding
  );
}

/* =========================================================
   APPLY FIX
========================================================= */

export async function applyPRFixService(
  owner: string,
  repo: string,
  number: number,
  fix: any
) {
  if (!fix || typeof fix !== "object") {
    throw new Error("Invalid AI fix.");
  }

  if (
    !Array.isArray(fix.changes) ||
    fix.changes.length === 0
  ) {
    throw new Error(
      "AI fix contains no changes."
    );
  }

  return applyPRFix(
    owner,
    repo,
    number,
    fix
  );
}

/* =========================================================
   AUTO FIX
========================================================= */

export async function autoFixPRService(
  owner: string,
  repo: string,
  number: number,
  category: string,
  finding: string
) {
  /*
   * 1. Analyze the original PR
   */
  const analysis =
    await analyzePRService(
      owner,
      repo,
      number
    );

  /*
   * 2. Generate AI fix
   */
  const fix =
    await generatePRFixService(
      owner,
      repo,
      number,
      category,
      finding
    );

  /*
   * 3. Stop if AI could not generate
   *    a safe fix
   */
  if (
    !fix.changes ||
    fix.changes.length === 0
  ) {
    return {
      success: false,
      stage: "FIX_GENERATION",
      analysis,
      fix,
      message:
        "No safe fix was generated.",
    };
  }

  /*
   * 4. Apply the generated fix.
   *
   * IMPORTANT:
   * repository-brain.applyPRFix()
   * expects:
   *
   * owner
   * repo
   * number
   * fix
   */
  const applied =
    await applyPRFixService(
      owner,
      repo,
      number,
      fix
    );

  /*
   * 5. Verification / GitHub PR creation
   *    failed
   */
  if (!applied.success) {
    return {
      success: false,
      stage: "VERIFICATION_FAILED",
      analysis,
      fix,
      applied,
    };
  }

  /*
   * 6. Success
   */
  return {
    success: true,
    stage: "COMPLETED",
    analysis,
    fix,
    applied,
  };
}