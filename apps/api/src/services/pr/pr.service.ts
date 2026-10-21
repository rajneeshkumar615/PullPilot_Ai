    import {
      analyzePullRequest,
      generatePRFix,
      generatePRFixes,
      applyPRFix,
    } from "@pullpilot/repository-brain";

    import type { PRExecutionMode } from "@pullpilot/repository-brain";


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
      GENERATE ALL FIXES
    ========================================================= */

    export async function generateAllPRFixesService(
      owner: string,
      repo: string,
      number: number,
      findings: Array<{
        category: string;
        finding: string;
      }>
    ) {
      return generatePRFixes(
        owner,
        repo,
        number,
        findings
      );
    }

    /* =========================================================
      APPLY FIX
    ========================================================= */

   export async function applyPRFixService(
  owner: string,
  repo: string,
  number: number,
  fix: any,
  mode: PRExecutionMode = "human",
  executionId?: string,
  forceMerge: boolean = false
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
  fix,
  mode,
  executionId,
  forceMerge
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
  finding: string,
  mode: PRExecutionMode = "human",
  executionId?: string
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
          mode,
          stage: "FIX_GENERATION",
          message:
            mode === "autonomous"
              ? "Autonomous execution stopped because no safe fix was generated."
              : "Human-Controlled execution stopped because no safe fix was generated.",
          analysis,
          fix,
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
      * mode
      * executionId
      */
      const applied =
        await applyPRFixService(
          owner,
          repo,
          number,
          fix,
          mode,
          executionId
        );

      /*
      * 5. Verification / GitHub PR creation
      *    failed
      */
      if (!applied.success) {
        return {
          success: false,
          mode,
          stage: applied.stage ?? "VERIFICATION_FAILED",
          message:
            applied.message ??
            (mode === "autonomous"
              ? "Autonomous execution failed during fix application or verification."
              : "Human-Controlled execution failed during fix application or verification."),
          url:
    applied.url ??
    "",
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
        mode,
        stage:
          applied.stage ??
          (mode === "autonomous"
            ? "COMPLETED"
            : "REVIEW_PR_CREATED"),
        message:
          applied.message ??
          (mode === "autonomous"
            ? "Autonomous execution completed successfully."
            : "Human-Controlled execution completed. Review PR created and is waiting for human approval."),
        url:
    applied.url ??
    "",
        automaticMerge:
          applied.automaticMerge ?? false,
        analysis,
        fix,
        applied,
      };
    }