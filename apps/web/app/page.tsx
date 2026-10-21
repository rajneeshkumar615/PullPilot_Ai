"use client";

import { FormEvent, useState } from "react";

type Analysis = {
  headRef: string;

  summary: string;
  risk: string;
  score: number;
  bugs: string[];
  security: string[];
  performance: string[];
  maintainability: string[];
  recommendations: string[];
};

type FixChange = {
  path: string;
  explanation: string;
  before: string;
  after: string;
};

type PRFix = {
  summary: string;
  risk: string;
  changes: FixChange[];
  tests: string[];
  warnings: string[];
};

type ExecutionMode = "human" | "autonomous";

function normalizeFinding(item: unknown): string {
  if (typeof item === "string") {
    return item;
  }

  if (
    item &&
    typeof item === "object" &&
    "description" in item &&
    typeof item.description === "string"
  ) {
    return item.description;
  }

  return String(item ?? "");
}

function normalizeFindings(items: unknown): string[] {
  return Array.isArray(items)
    ? items
        .map(normalizeFinding)
        .filter((item) => item.length > 0)
    : [];
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const [owner, setOwner] = useState("rajneeshkumar615");
  const [repo, setRepo] = useState("StayNest");
  const [number, setNumber] = useState("1");

  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("human");

  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const [loading, setLoading] = useState(false);
  const [bulkFixLoading, setBulkFixLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const [error, setError] = useState("");
  const [fixError, setFixError] = useState("");
  const [fixErrorIsSafety, setFixErrorIsSafety] = useState(false);
  const [fixErrorIsContext, setFixErrorIsContext] =
  useState(false);

  const [generatedFix, setGeneratedFix] =
    useState<PRFix | null>(null);

  /*
   * A fix plan is executable only when the fix engine
   * returns at least one validated code change.
   *
   * If the plan contains zero changes, execution controls
   * must not be exposed to the user.
   */
  const [fixPlanRejected, setFixPlanRejected] = useState(false);

  const [applyResult, setApplyResult] = useState("");
  const [applyResultUrl, setApplyResultUrl] = useState("");
  const [executionBlocked, setExecutionBlocked] = useState(false);
  const [applyMerged, setApplyMerged] = useState(false);
  const [applyMergeSha, setApplyMergeSha] = useState("");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [executionStage, setExecutionStage] = useState("IDLE");

  /*
   * Dangerous confirmation is intentionally
   * hidden until the backend explicitly asks
   * for confirmation.
   */
  const [requiresMergeConfirmation, setRequiresMergeConfirmation] =
    useState(false);

  const [mergeWarnings, setMergeWarnings] = useState<string[]>([]);
  const [forceMergeLoading, setForceMergeLoading] = useState(false);

  async function analyzePR(event: FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setFixError("");
    setFixErrorIsSafety(false);
    setGeneratedFix(null);
    setFixPlanRejected(false);
    setApplyResult("");
    setApplyResultUrl("");
    setExecutionBlocked(false);
    setApplyMergeSha("");
    setApplyMerged(false);
    setRequiresMergeConfirmation(false);
    setMergeWarnings([]);
    setAnalysis(null);

    try {
      const response = await fetch(
        `${API_URL}/api/pr/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner,
            repo,
            number: Number(number),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "PR analysis failed."
        );
      }

      // The API may return the analysis directly or
      // inside a `data` / `analysis` wrapper.
      const result =
        data?.analysis ??
        data?.data ??
        data;

      setAnalysis({
  headRef:
    result?.head?.ref ||
    result?.headRef ||
    "UNKNOWN",

  summary:
    result?.summary ||
    "No summary returned.",

        risk:
          result?.risk ||
          "UNKNOWN",

        score:
          Number(result?.score ?? 0),

        bugs:
          normalizeFindings(result?.bugs),

        security:
          normalizeFindings(result?.security),

        performance:
          normalizeFindings(result?.performance),

        maintainability:
          normalizeFindings(
            result?.maintainability
          ),

        recommendations:
          normalizeFindings(
            result?.recommendations
          ),
      });
    } catch (err) {
  const message =
    err instanceof Error
      ? err.message
      : "Unable to generate the consolidated fix plan.";

  setFixErrorIsContext(
    /PR HEAD|file context|retrieve|GitHub file/i.test(
      message
    )
  );

  setFixError(message);
} finally {
      setLoading(false);
    }
  }

  function buildFindingsPayload(currentAnalysis: Analysis) {
    return [
      ...currentAnalysis.bugs.map((finding) => ({
        category: "BUGS",
        finding,
      })),

      ...currentAnalysis.security.map((finding) => ({
        category: "SECURITY",
        finding,
      })),

      ...currentAnalysis.performance.map((finding) => ({
        category: "PERFORMANCE",
        finding,
      })),

      ...currentAnalysis.maintainability.map((finding) => ({
        category: "MAINTAINABILITY",
        finding,
      })),
    ];
  }

  async function generateAllFixes() {
    if (!analysis) {
      return;
    }

    const findings = buildFindingsPayload(analysis);

    if (findings.length === 0) {
      setFixError(
        "No findings are available to generate fixes for."
      );
      setFixErrorIsSafety(false);
      return;
    }

    setBulkFixLoading(true);
    setFixError("");
    setFixErrorIsSafety(false);
    setFixErrorIsContext(false);
    setGeneratedFix(null);
    setFixPlanRejected(false);
    setApplyResult("");
    setApplyResultUrl("");
    setExecutionBlocked(false);
    setApplyMergeSha("");
    setApplyMerged(false);
    setRequiresMergeConfirmation(false);
    setMergeWarnings([]);

    try {
      const response = await fetch(
        `${API_URL}/api/pr/generate-all-fixes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner,
            repo,
            number: Number(number),
            findings,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Generating the consolidated fix plan failed."
        );
      }

      const changes =
        Array.isArray(data.changes)
          ? data.changes
          : [];

      const warnings =
        Array.isArray(data.warnings)
          ? data.warnings
          : [];

      /*
       * Zero changes means the fix engine did not produce
       * an executable patch. Treat this as a rejected plan,
       * not as an execution-ready plan.
       */
      const rejected =
        changes.length === 0 ||
        warnings.some(
          (warning: unknown) =>
            typeof warning === "string" &&
            /fix plan rejected|pre-validation|safety check failed/i.test(
              warning
            )
        );

      setFixPlanRejected(rejected);

      setGeneratedFix({
        summary:
          data.summary ||
          "No fix summary returned.",

        risk:
          data.risk ||
          "UNKNOWN",

        changes,

        tests:
          Array.isArray(data.tests)
            ? data.tests
            : [],

        warnings,
      });
    } catch (err) {
      setFixError(
        err instanceof Error
          ? err.message
          : "Unable to generate the consolidated fix plan."
      );
    } finally {
      setBulkFixLoading(false);
    }
  }

  async function applyAllFixes(forceMerge = false) {
    if (!generatedFix) {
      return;
    }

    if (
      fixPlanRejected ||
      generatedFix.changes.length === 0
    ) {
      setFixError(
        "The fix plan is not executable. PullPilot blocked execution because no safely validated code changes are available."
      );

      setFixErrorIsSafety(false);

      return;
    }

    if (forceMerge) {
      setForceMergeLoading(true);
    } else {
      setApplyLoading(true);
    }

    setIsCancelling(false);

    setExecutionStage(
      executionMode === "autonomous"
        ? forceMerge
          ? "CONTINUING AUTONOMOUS EXECUTION"
          : "AUTONOMOUS EXECUTION"
        : "APPLYING FIX"
    );

    setFixError("");
    setFixErrorIsSafety(false);

    if (!forceMerge) {
      setApplyResult("");
      setApplyResultUrl("");
      setExecutionBlocked(false);
      setApplyMergeSha("");
      setApplyMerged(false);
    }

    /*
     * Once the user explicitly chooses to continue,
     * remove the dangerous confirmation from the UI.
     *
     * The backend remains the authority.
     */
    if (forceMerge) {
      setRequiresMergeConfirmation(false);
      setMergeWarnings([]);
    }

    const currentExecutionId =
      executionMode === "autonomous"
        ? crypto.randomUUID()
        : null;

    setExecutionId(currentExecutionId);

    try {
      const response = await fetch(
        `${API_URL}/api/pr/apply-fix`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
         body: JSON.stringify({
  owner,
  repo,
  number: Number(number),
  fix: generatedFix,
  mode: executionMode,
  forceMerge,

  ...(executionMode === "autonomous" && currentExecutionId
    ? {
        executionId: currentExecutionId,
      }
    : {}),
}),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const message =
          data?.error ||
          "Applying the fix plan failed.";

        const isSafetyRejection =
          /before|safety|validat|head|sha|branch/i.test(
            message
          );

        setFixErrorIsSafety(isSafetyRejection);

        throw new Error(message);
      }

      /*
       * Autonomous execution can successfully create the
       * review PR and then intentionally stop at a safety gate,
       * such as failed CI.
       *
       * This is NOT an API failure. Preserve the PR URL so the
       * user can review the blocked fix PR.
       */
      if (
        data.merged === false &&
        data.url &&
        (data.safety === "DANGEROUS" ||
          data.safety === "SUSPICIOUS")
      ) {
        setExecutionBlocked(true);

        setApplyResult(
          data.message ||
            "Automatic merge was not completed because a safety gate blocked the merge."
        );

        setApplyResultUrl(data.url);

        setFixErrorIsSafety(true);

        return;
      }

      if (data.merged === true) {
        setExecutionBlocked(false);

        setApplyResult(
          data.message ||
            "Fix applied automatically and review PR merged successfully."
        );

        setApplyResultUrl(
          data.url ||
            data.pullRequestUrl ||
            ""
        );

        return;
      }

      setExecutionBlocked(false);

      setApplyResult(
        data.message ||
          "Review PR created successfully."
      );

      setApplyResultUrl(
        data.url ||
          data.pullRequestUrl ||
          ""
      );

      /*
       * Cancellation
       */
      if (data?.stage === "CANCELLED") {
        setExecutionStage("CANCELLED");
        setFixErrorIsSafety(true);

        setFixError(
          data?.message ||
            "Autonomous execution was cancelled. No further operation was performed."
        );

        return;
      }

      /*
       * --------------------------------------------------
       * WARNING CONFIRMATION
       *
       * THIS IS NOT A GENERIC ERROR.
       *
       * We intentionally render this below the
       * Autonomous mode card.
       * --------------------------------------------------
       */
      if (
        executionMode === "autonomous" &&
        data?.stage === "AWAITING_DANGEROUS_CONFIRMATION" &&
        data?.requiresConfirmation === true
      ) {
        setExecutionStage("AWAITING CONFIRMATION");

        setRequiresMergeConfirmation(true);

        const userWarnings =
          Array.isArray(data?.warnings)
            ? data.warnings.filter(
                (warning: unknown) =>
                  typeof warning === "string" &&
                  !/autonomous merge is paused because the fix engine returned warnings/i.test(
                    warning
                  ) &&
                  !/choose stop & review to cancel, or must merge anyway to continue/i.test(
                    warning
                  )
              )
            : [];

        setMergeWarnings(
          userWarnings.length > 0
            ? userWarnings
            : [
                "The fix engine returned warnings that require explicit review before autonomous execution can continue.",
              ]
        );

        /*
         * Do NOT populate fixError here.
         *
         * Otherwise the warning appears at the
         * top of the Fix Engine instead of beneath
         * Autonomous mode.
         */
        return;
      }

      /*
       * Explicit dangerous/suspicious stop
       * that is NOT the confirmation gate.
       */
      if (data?.safety === "DANGEROUS") {
        setFixErrorIsSafety(true);

        setFixError(
          data?.message ||
            "PullPilot detected a dangerous condition and stopped execution."
        );

        return;
      }

      if (data?.safety === "SUSPICIOUS") {
        setFixErrorIsSafety(true);

        setFixError(
          data?.message ||
            "PullPilot detected a suspicious condition and paused execution."
        );

        return;
      }

      /*
       * --------------------------------------------------
       * VERIFIED AUTONOMOUS MERGE
       * --------------------------------------------------
       */
      if (
        executionMode === "autonomous" &&
        data?.merged === true
      ) {
        setApplyMerged(true);

        setExecutionStage("GITHUB MERGE VERIFIED");

        setApplyResult(
          data?.message ||
            "Autonomous execution completed successfully. The fix PR was validated, merged, and verified on GitHub."
        );

        setApplyResultUrl(
          data?.url ||
            data?.pullRequestUrl ||
            data?.pullRequest?.url ||
            ""
        );

        setApplyMergeSha(
          data?.mergeSha ||
            data?.pullRequest?.mergeCommitSha ||
            ""
        );

        return;
      }

      /*
       * --------------------------------------------------
       * HUMAN MODE
       * --------------------------------------------------
       */
      setExecutionStage("REVIEW PR CREATED");

      setApplyResult(
        data?.message ||
          "Fix plan applied successfully and review PR created."
      );

      setApplyResultUrl(
        data?.url ||
          data?.pullRequestUrl ||
          data?.pullRequest?.url ||
          ""
      );

      setApplyMerged(false);
    } catch (err) {
      setFixError(
        err instanceof Error
          ? err.message
          : "Unable to apply the fix plan."
      );
    } finally {
      setApplyLoading(false);
      setForceMergeLoading(false);
      setIsCancelling(false);
      setExecutionId(null);
    }
  }

  async function cancelAutonomousExecution() {
    if (
      executionMode !== "autonomous" ||
      !executionId ||
      !applyLoading
    ) {
      return;
    }

    setIsCancelling(true);
    setExecutionStage("CANCELLING");

    try {
      const response = await fetch(
        `${API_URL}/api/pr/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ executionId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to cancel autonomous execution."
        );
      }
    } catch (err) {
      setIsCancelling(false);
      setExecutionStage("AUTONOMOUS EXECUTION");
      setFixError(
        err instanceof Error
          ? err.message
          : "Unable to cancel autonomous execution."
      );
    }
  }

  const totalFindings = analysis
    ? analysis.bugs.length +
      analysis.security.length +
      analysis.performance.length +
      analysis.maintainability.length
    : 0;

  const categories = analysis
    ? [
        {
          label: "Bugs",
          value: analysis.bugs.length,
          tone: "danger",
          icon: "!",
        },
        {
          label: "Security",
          value: analysis.security.length,
          tone: "danger",
          icon: "×",
        },
        {
          label: "Performance",
          value: analysis.performance.length,
          tone: "warning",
          icon: "~",
        },
        {
          label: "Maintainability",
          value: analysis.maintainability.length,
          tone: "brand",
          icon: "◇",
        },
      ]
    : [];

  const maxCategory = Math.max(
    ...categories.map((item) => item.value),
    1
  );

  const hasExecutableFix =
    !!generatedFix &&
    generatedFix.changes.length > 0 &&
    !fixPlanRejected;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">P</div>

            <div>
              <div className="brand-name">
                PullPilot
              </div>

              <div className="brand-version">
                AI PR ENGINEER
              </div>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-label">
              WORKSPACE
            </div>

            <a
              className="nav-item active"
              href="#analyze"
            >
              <span>⌁</span>
              Analyze PR
            </a>

            <a
              className="nav-item"
              href="#overview"
            >
              <span>◫</span>
              Overview
            </a>

            <a
              className="nav-item"
              href="#findings"
            >
              <span>◈</span>
              Findings
            </a>

            <a
              className="nav-item"
              href="#recommendations"
            >
              <span>✦</span>
              Recommendations
            </a>

            <a
              className="nav-item"
              href="#fix-engine"
            >
              <span>⌘</span>
              Fix Engine
            </a>
          </div>

          <div className="nav-section nav-section-secondary">
            <div className="nav-label">
              ENGINE
            </div>

            <div className="nav-item muted-nav">
              <span>⌘</span>
              Fix Engine
              <em>ACTIVE</em>
            </div>

            <div className="nav-item muted-nav">
              <span>✓</span>
              Verification
              <em>READY</em>
            </div>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="status-row">
              <span className="status-dot" />
              API Connected
            </div>

            <span className="api-address">
              localhost:4000
            </span>
          </div>

          <div className="sidebar-footer">
            <span>PullPilot AI</span>
            <span>v0.2.0</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              DEVELOPER INTELLIGENCE / PR REVIEW
            </div>

            <h1>Pull Request Review</h1>
          </div>

          <div className="engine-status">
            <span className="status-dot" />
            AI ENGINE ONLINE

            <span className="topbar-divider" />

            <span className="mono">
              OPENROUTER
            </span>
          </div>
        </header>

        <div className="content">
          <section
            className="hero"
            id="analyze"
          >
            <div className="hero-copy">
              <div className="pill">
                <span className="live-dot" />
                GITHUB CONNECTED
              </div>

              <div className="hero-overline">
                AI CODE REVIEW INFRASTRUCTURE
              </div>

              <h2>
                Understand code
                <br />
                <span>before it ships.</span>
              </h2>

              <p>
                PullPilot reads the pull request,
                evaluates engineering risk, surfaces
                concrete findings, and turns
                recommendations into reviewable fixes.
              </p>

              <div className="hero-terminal">
                <span className="terminal-prompt">
                  $
                </span>

                <span>
                  pullpilot review --pr {number}
                </span>

                <span className="terminal-cursor" />
              </div>
            </div>

            <div className="hero-visual">
              <div className="visual-grid" />
              <div className="scan-line" />

              <div className="hero-orbit orbit-a" />
              <div className="hero-orbit orbit-b" />

              <div className="hero-core">
                <span>P</span>
              </div>

              <div className="hero-node node-a">
                PR
              </div>

              <div className="hero-node node-b">
                AI
              </div>

              <div className="hero-node node-c">
                FIX
              </div>

              <div className="hero-connection connection-a" />
              <div className="hero-connection connection-b" />
              <div className="hero-connection connection-c" />

              <div className="visual-label top">
                REPOSITORY SIGNALS
              </div>

              <div className="visual-label bottom">
                ANALYZE · VALIDATE · REVIEW
              </div>
            </div>
          </section>

          <section className="analyzer-card">
            <div className="section-heading">
              <div>
                <div className="section-kicker">
                  ANALYSIS CONTROL
                </div>

                <h3>Start an AI review</h3>
              </div>

              <div className="endpoint">
                POST /api/pr/analyze
              </div>
            </div>

            <form
              onSubmit={analyzePR}
              className="analyzer-form"
            >
              <Field
                label="OWNER"
                value={owner}
                onChange={setOwner}
              />

              <Field
                label="REPOSITORY"
                value={repo}
                onChange={setRepo}
              />

              <div className="field">
                <label>PR NUMBER</label>

                <input
                  value={number}
                  onChange={(e) =>
                    setNumber(e.target.value)
                  }
                  type="number"
                  min="1"
                />
              </div>

              <button
                type="submit"
                className="analyze-button"
                disabled={loading || applyLoading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    ANALYZING
                  </>
                ) : (
                  <>
                    Analyze PR <span>↗</span>
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="error-box">
                <div className="error-title">
                  ANALYSIS FAILED
                </div>

                <span>{error}</span>
              </div>
            )}
          </section>

          {analysis && (
            <>
              <section
                className="pr-identity"
                id="overview"
              >
                <div>
                  <div className="repo-path">
                    <span>github</span> / {owner} /{" "}
                    {repo}
                  </div>

                  <div className="pr-title-row">
                    <h2>
                      Pull request #{number}
                    </h2>

                    <span
                      className={`risk-badge ${riskClass(
                        analysis.risk
                      )}`}
                    >
                      <span />
                      {analysis.risk} RISK
                    </span>
                  </div>

                  <p>
                    Analyzed by PullPilot AI ·
                    engineering review complete
                  </p>
                </div>

                <div className="pr-meta">
                  <div>
                    <span>BASE</span>
                    <strong>main</strong>
                  </div>

               <div>
  <span>HEAD</span>
  <strong>{analysis.headRef}</strong>
</div>
                  <div>
                    <span>ENGINE</span>
                    <strong>AI + RULES</strong>
                  </div>
                </div>
              </section>

              <section className="dashboard-grid">
                <div className="health-panel panel">
                  <div className="panel-heading">
                    <div>
                      <div className="card-kicker">
                        ENGINEERING HEALTH
                      </div>

                      <h3>Risk posture</h3>
                    </div>

                    <span
                      className={`risk-mini ${riskClass(
                        analysis.risk
                      )}`}
                    >
                      {analysis.risk}
                    </span>
                  </div>

                  <RiskGauge
                    score={analysis.score}
                  />

                  <div className="health-foot">
                    <div>
                      <span>SCORE</span>
                      <strong>
                        {analysis.score}
                      </strong>
                    </div>

                    <div>
                      <span>FINDINGS</span>
                      <strong>
                        {totalFindings}
                      </strong>
                    </div>

                    <div>
                      <span>STATUS</span>
                      <strong>
                        {analysis.score >= 70
                          ? "HEALTHY"
                          : "REVIEW"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="radar-panel panel">
                  <div className="panel-heading">
                    <div>
                      <div className="card-kicker">
                        RISK BY CATEGORY
                      </div>

                      <h3>
                        Engineering signals
                      </h3>
                    </div>

                    <span className="mono subtle">
                      4 AXES
                    </span>
                  </div>

                  <RadarChart
                    categories={categories}
                  />

                  <div className="radar-legend">
                    {categories.map((item) => (
                      <span key={item.label}>
                        <i
                          className={`legend-dot ${item.tone}`}
                        />

                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="metric-strip">
                <MetricCard
                  label="BUGS"
                  value={analysis.bugs.length}
                  icon="!"
                  tone="danger"
                />

                <MetricCard
                  label="SECURITY"
                  value={analysis.security.length}
                  icon="×"
                  tone="danger"
                />

                <MetricCard
                  label="PERFORMANCE"
                  value={
                    analysis.performance.length
                  }
                  icon="~"
                  tone="warning"
                />

                <MetricCard
                  label="MAINTAINABILITY"
                  value={
                    analysis.maintainability.length
                  }
                  icon="◇"
                  tone="brand"
                />

                <div className="metric-card total-card">
                  <div className="metric-top">
                    <span>
                      TOTAL SIGNALS
                    </span>

                    <span>Σ</span>
                  </div>

                  <div className="metric-value">
                    {totalFindings}
                  </div>

                  <div className="metric-description">
                    AI-detected review findings
                  </div>
                </div>
              </section>

              <section className="summary-card panel">
                <div className="summary-main">
                  <div className="card-kicker">
                    AI ENGINEERING SUMMARY
                  </div>

                  <p>{analysis.summary}</p>
                </div>

                <div className="summary-side">
                  <span className="ai-chip">
                    <i /> OPENROUTER AI
                  </span>

                  <span className="mono">
                    {totalFindings} SIGNALS
                  </span>
                </div>
              </section>

              <section
                className="findings-section"
                id="findings"
              >
                <div className="section-title">
                  <div>
                    <div className="section-kicker">
                      CODE REVIEW / SIGNALS
                    </div>

                    <h2>Findings</h2>

                    <p className="section-description">
                      Concrete engineering signals
                      detected from the pull request.
                    </p>
                  </div>

                  <span className="finding-count mono">
                    {totalFindings} findings
                  </span>
                </div>

                <div className="finding-layout">
                  <div className="finding-list-large">
                    <FindingGroup
                      title="Bugs"
                      icon="!"
                      items={analysis.bugs}
                      tone="danger"
                    />

                    <FindingGroup
                      title="Security"
                      icon="×"
                      items={analysis.security}
                      tone="danger"
                    />

                    <FindingGroup
                      title="Performance"
                      icon="~"
                      items={analysis.performance}
                      tone="warning"
                    />

                    <FindingGroup
                      title="Maintainability"
                      icon="◇"
                      items={
                        analysis.maintainability
                      }
                      tone="brand"
                    />
                  </div>

                  <div className="category-bars panel">
                    <div className="panel-heading">
                      <div>
                        <div className="card-kicker">
                          DISTRIBUTION
                        </div>

                        <h3>
                          Findings by category
                        </h3>
                      </div>
                    </div>

                    <div className="bars">
                      {categories.map((item) => (
                        <div
                          className="bar-row"
                          key={item.label}
                        >
                          <div className="bar-label">
                            <span>
                              {item.icon}
                            </span>

                            {item.label}

                            <strong>
                              {item.value}
                            </strong>
                          </div>

                          <div className="bar-track">
                            <div
                              className={`bar-fill ${item.tone}`}
                              style={{
                                width: `${
                                  (item.value /
                                    maxCategory) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bar-foot">
                      <span>
                        LOWER IS BETTER
                      </span>

                      <span className="mono">
                        {totalFindings} TOTAL
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="recommendations-section"
                id="recommendations"
              >
                <div className="section-title">
                  <div>
                    <div className="section-kicker">
                      AI ENGINEER / ACTIONS
                    </div>

                    <h2>
                      Recommended actions
                    </h2>

                    <p className="section-description">
                      Review the recommended actions
                      before generating one consolidated
                      fix plan.
                    </p>
                  </div>

                  <span className="ai-badge">
                    AI GENERATED
                  </span>
                </div>

                {!applyLoading && (
                <div className="fix-it-now-panel panel">
                  <div className="fix-it-now-copy">
                    <span className="fix-it-now-kicker">
                      FIX ENGINE · ONE-CLICK
                    </span>

                    <p>
                      PullPilot will send all detected
                      findings to the fix engine in one
                      request and consolidate overlapping
                      issues into a single reviewable fix
                      plan.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="fix-it-now-button"
                    disabled={
                      bulkFixLoading ||
                      applyLoading ||
                      totalFindings === 0
                    }
                    onClick={generateAllFixes}
                  >
                    {bulkFixLoading ? (
                      <>
                        <span className="spinner" />
                        GENERATING ALL FIXES...
                      </>
                    ) : generatedFix ? (
                      <>
                        <span className="fix-it-now-glyph">
                          ✦
                        </span>

                        {fixPlanRejected
                          ? "REGENERATE FIX PLAN"
                          : "REGENERATE ALL FIXES"}
                      </>
                    ) : (
                      <>
                        <span className="fix-it-now-glyph">
                          ✦
                        </span>

                        FIX IT NOW

                        <em>
                          GENERATE ALL FIXES
                        </em>
                      </>
                    )}
                  </button>
                </div>
                )}

                <div className="recommendations panel">
                  {analysis.recommendations
                    .length === 0 ? (
                    <div className="empty-state">
                      No recommendations returned.
                    </div>
                  ) : (
                    analysis.recommendations.map(
                      (item, index) => (
                        <div
                          className="recommendation"
                          key={`${item}-${index}`}
                        >
                          <div className="recommendation-marker">
                            +
                          </div>

                          <div className="recommendation-body">
                            <div className="recommendation-copy">
                              <span className="recommendation-index mono">
                                ACTION{" "}
                                {String(
                                  index + 1
                                ).padStart(2, "0")}
                              </span>

                              <p>{item}</p>
                            </div>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>
              </section>

              {fixError && (
                <section
                  className={`fix-error panel ${
                    fixErrorIsSafety
                      ? "fix-error-safety"
                      : ""
                  }`}
                >
                 <div className="fix-error-title">
  {fixErrorIsContext
    ? "PR HEAD CONTEXT UNAVAILABLE"
    : fixErrorIsSafety
      ? "FIX BLOCKED BY SAFETY VALIDATION"
      : "FIX ENGINE ERROR"}
</div>
{fixErrorIsContext && (
  <p className="fix-error-note">
    PullPilot could not safely retrieve the required
    files from the exact PR HEAD commit. No AI fix was
    generated and no repository changes were applied.
  </p>
)}

                  <p>{fixError}</p>

                  {fixErrorIsSafety && (
                    <p className="fix-error-note">
                      PullPilot stopped the autonomous execution before
                      completing the merge. The generated fix and review PR
                      remain available for inspection. No automatic merge was
                      performed.
                    </p>
                  )}
                </section>
              )}

              {generatedFix && (
                <section
                  className="generated-fix-section"
                  id="fix-engine"
                >
                  <div className="section-title">
                    <div>
                      <div className="section-kicker">
                        FIX ENGINE / CONSOLIDATED PLAN
                      </div>

                      <h2>
                        Consolidated Fix Plan
                      </h2>

                      <p className="section-description">
                        Review every proposed change
                        together before PullPilot applies
                        the plan.
                      </p>
                    </div>

                    <span
                      className={`risk-badge ${riskClass(
                        generatedFix.risk
                      )}`}
                    >
                      <span />
                      {generatedFix.risk} RISK
                    </span>
                  </div>

                  <div className="generated-fix panel">
                    <div className="fix-plan-stats">
                      <div className="fix-plan-stat">
                        <span>
                          FINDINGS IN REVIEW
                        </span>

                        <strong>
                          {totalFindings}
                        </strong>
                      </div>

                      <div className="fix-plan-stat">
                        <span>
                          VALID CHANGES
                        </span>

                        <strong>
                          {generatedFix.changes.length}
                        </strong>
                      </div>

                      <div className="fix-plan-stat">
                        <span>
                          OVERALL RISK
                        </span>

                        <strong>
                          {generatedFix.risk}
                        </strong>
                      </div>
                    </div>

                    <div className="fix-summary">
                      <div>
                        <div className="card-kicker">
                          CONSOLIDATED AI FIX SUMMARY
                        </div>

                        <p>
                          {generatedFix.summary}
                        </p>
                      </div>

                      <div className="fix-engine-badge">
                        FIX ENGINE
                      </div>
                    </div>

                    {fixPlanRejected ||
                    generatedFix.changes.length === 0 ? (
                      <div className="fix-plan-rejected">
                        <div className="fix-plan-rejected-icon">
                          !
                        </div>

                        <div className="fix-plan-rejected-content">
                          <span className="fix-plan-rejected-kicker">
                            EXECUTION BLOCKED
                          </span>

                          <h3>
                            Fix plan rejected
                          </h3>

                          <p>
                            PullPilot could not safely validate
                            an executable code change. Execution
                            controls are disabled until a valid
                            fix plan is generated.
                          </p>

                          <div className="fix-plan-rejected-reason">
                            <strong>
                              SAFETY REASON
                            </strong>

                            <span>
                              {generatedFix.warnings.find(
                                (warning) =>
                                  !/autonomous merge is paused|choose stop & review/i.test(
                                    warning
                                  )
                              ) ||
                                "The fix engine returned no executable code changes."}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="fix-plan-regenerate-button"
                            disabled={
                              bulkFixLoading ||
                              applyLoading
                            }
                            onClick={generateAllFixes}
                          >
                            ↻ REGENERATE FIX PLAN
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="fix-changes">
                        {generatedFix.changes.map(
                          (change, index) => (
                            <article
                              className="fix-change"
                              key={`${change.path}-${index}`}
                            >
                              <div className="fix-change-header">
                                <div>
                                  <span className="card-kicker">
                                    FILE
                                  </span>

                                  <strong className="fix-file">
                                    {change.path}
                                  </strong>
                                </div>

                                <span className="change-number mono">
                                  CHANGE{" "}
                                  {String(
                                    index + 1
                                  ).padStart(2, "0")}
                                </span>
                              </div>

                              <p className="fix-explanation">
                                {change.explanation}
                              </p>

                              <div className="code-comparison">
                                <div className="code-panel before">
                                  <div className="code-panel-header">
                                    <span className="code-dot remove">
                                      −
                                    </span>

                                    BEFORE
                                  </div>

                                  <pre>
                                    <code>
                                      {change.before ||
                                        "No previous code returned."}
                                    </code>
                                  </pre>
                                </div>

                                <div className="code-arrow">
                                  →
                                </div>

                                <div className="code-panel after">
                                  <div className="code-panel-header">
                                    <span className="code-dot add">
                                      +
                                    </span>

                                    AFTER
                                  </div>

                                  <pre>
                                    <code>
                                      {change.after ||
                                        "No replacement code returned."}
                                    </code>
                                  </pre>
                                </div>
                              </div>
                            </article>
                          )
                        )}
                      </div>
                    )}

                    {hasExecutableFix && (
                    <div className="fix-verification">
                      <div className="verification-card">
                        <span className="verification-icon">
                          ✓
                        </span>

                        <div>
                          <strong>
                            TEST PLAN
                          </strong>

                          {generatedFix.tests
                            .length === 0 ? (
                            <p>
                              No tests were returned
                              by the fix engine.
                            </p>
                          ) : (
                            <ul>
                              {generatedFix.tests.map(
                                (test, index) => (
                                  <li key={index}>
                                    {test}
                                  </li>
                                )
                              )}
                            </ul>
                          )}
                        </div>
                      </div>

                      <div className="verification-card warning">
                        <span className="verification-icon">
                          !
                        </span>

                        <div>
                          <strong>
                            WARNINGS
                          </strong>

                          {generatedFix.warnings
                            .length === 0 ? (
                            <p>
                              No warnings returned.
                            </p>
                          ) : (
                            <ul>
                              {generatedFix.warnings.map(
                                (
                                  warning,
                                  index
                                ) => (
                                  <li key={index}>
                                    {warning}
                                  </li>
                                )
                              )}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    {hasExecutableFix && applyLoading &&
                    executionMode === "autonomous" ? (
                      <section className="autonomous-execution-panel panel">
                        <div className="execution-live-header">
                          <div>
                            <div className="card-kicker">
                              AUTONOMOUS EXECUTION
                            </div>

                            <h3>
                              PullPilot is executing the fix
                            </h3>
                          </div>

                          <span className="execution-live-badge">
                            LIVE
                          </span>
                        </div>

                        <p>
                          PullPilot is validating the patch,
                          verifying the PR HEAD, running safety
                          checks, checking CI, and preparing the
                          GitHub merge.
                        </p>

                        <div className="execution-stage-track">
                          {[
                            "APPLY",
                            "VERIFY",
                            "SAFETY",
                            "CI",
                            "MERGE",
                          ].map((stage, index) => (
                            <div
                              className="execution-stage-item"
                              key={stage}
                            >
                              <span>{index + 1}</span>

                              <strong>{stage}</strong>

                              {index < 4 && <i>→</i>}
                            </div>
                          ))}
                        </div>

                        <div className="autonomous-execution-status">
                          <span className="execution-dot" />

                          <span>{executionStage}</span>
                        </div>

                        <button
                          type="button"
                          className="cancel-execution-button"
                          onClick={cancelAutonomousExecution}
                          disabled={isCancelling}
                        >
                          {isCancelling
                            ? "CANCELLING..."
                            : "CANCEL AUTONOMOUS EXECUTION"}
                        </button>
                      </section>
                    ) : hasExecutableFix ? (
                      <section className="execution-control-center">
                        <div className="execution-mode-header">
                          <div>
                            <div className="card-kicker">
                              EXECUTION MODE
                            </div>

                            <h3>
                              Choose how PullPilot should execute
                              this fix.
                            </h3>

                            <p className="execution-mode-description">
                              Human-Controlled mode stops at a
                              review-ready PR. Autonomous mode
                              continues through PullPilot's safety
                              gates and may merge only after GitHub
                              confirms every required condition.
                            </p>
                          </div>

                          <div
                            className={`execution-mode-current ${
                              executionMode === "autonomous"
                                ? "autonomous"
                                : "human"
                            }`}
                          >
                            <span className="execution-mode-current-dot" />

                            {executionMode === "autonomous"
                              ? "AUTONOMOUS MODE ENABLED"
                              : "HUMAN MODE ENABLED"}
                          </div>
                        </div>

                        <div className="execution-mode-grid">
                          {/* HUMAN */}
                          <button
                            type="button"
                            className={`execution-mode-card human ${
                              executionMode === "human"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setExecutionMode("human")
                            }
                          >
                            <div className="execution-mode-card-header">
                              <div className="execution-mode-card-title">
                                <span className="execution-mode-icon human">
                                  ✓
                                </span>

                                <div>
                                  <strong>
                                    HUMAN-CONTROLLED
                                  </strong>

                                  {executionMode === "human" && (
                                    <span className="execution-mode-enabled">
                                      ✓ ENABLED
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span className="execution-mode-radio">
                                {executionMode === "human"
                                  ? "✓"
                                  : ""}
                              </span>
                            </div>

                            <div className="execution-mode-card-subtitle">
                              You approve every merge.
                            </div>

                            <p>
                              PullPilot applies and verifies the
                              fix, creates a review-ready PR, and
                              stops before merging.
                            </p>

                            <div className="execution-mode-flow">
                              <span>APPLY</span>
                              <i>→</i>
                              <span>VERIFY</span>
                              <i>→</i>
                              <span>REVIEW PR</span>
                              <i>→</i>
                              <span>YOU APPROVE</span>
                            </div>

                            <div className="execution-mode-card-action">
                              APPLY FIX & CREATE REVIEW PR
                              <span>↗</span>
                            </div>
                          </button>

                          {/* AUTONOMOUS */}
                          <button
                            type="button"
                            className={`execution-mode-card autonomous ${
                              executionMode === "autonomous"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setExecutionMode("autonomous")
                            }
                          >
                            <div className="execution-mode-card-header">
                              <div className="execution-mode-card-title">
                                <span className="execution-mode-icon autonomous">
                                  ⚡
                                </span>

                                <div>
                                  <strong>
                                    AUTONOMOUS
                                  </strong>

                                  {executionMode === "autonomous" && (
                                    <span className="execution-mode-enabled">
                                      ✓ ENABLED
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span className="execution-mode-radio">
                                {executionMode === "autonomous"
                                  ? "✓"
                                  : ""}
                              </span>
                            </div>

                            <div className="execution-mode-card-subtitle">
                              PullPilot handles the full flow.
                            </div>

                            <p>
                              PullPilot continues through validation,
                              CI, mergeability, risk, and safety
                              gates before attempting an automatic
                              merge.
                            </p>

                            <div className="execution-mode-flow">
                              <span>APPLY</span>
                              <i>→</i>
                              <span>VERIFY</span>
                              <i>→</i>
                              <span>SAFETY</span>
                              <i>→</i>
                              <span>AUTO MERGE</span>
                            </div>

                            <div className="execution-mode-card-action">
                              APPLY ALL FIXES & AUTO MERGE
                              <span>↗</span>
                            </div>
                          </button>
                        </div>

                        <div
                          className={`execution-mode-message ${
                            executionMode === "autonomous"
                              ? "autonomous"
                              : "human"
                          }`}
                        >
                          <span>
                            {executionMode === "autonomous"
                              ? "⚡"
                              : "✓"}
                          </span>

                          <div>
                            <strong>
                              {executionMode === "autonomous"
                                ? "Autonomous execution is enabled"
                                : "Human-Controlled execution is enabled"}
                            </strong>

                            <p>
                              {executionMode === "autonomous"
                                ? "PullPilot can automatically merge only when all required safety gates pass. A dangerous, suspicious, conflicting, failed, or unverifiable condition stops the execution."
                                : "PullPilot will create the review PR but will never merge it automatically. You remain responsible for approving the merge."}
                            </p>
                          </div>
                        </div>

                        {/* =====================================================
                            DANGEROUS ACTION
                            THIS IS INTENTIONALLY BELOW AUTONOMOUS MODE.
                            IT DOES NOT EXIST UNTIL THE BACKEND REQUESTS IT.
                           ===================================================== */}

                        {requiresMergeConfirmation &&
                          executionMode === "autonomous" && (
                            <section className="danger-confirmation">
                              <div className="danger-confirmation-header">
                                <div className="danger-icon">
                                  !
                                </div>

                                <div>
                                  <span className="danger-kicker">
                                    SAFETY OVERRIDE
                                  </span>

                                  <h3>
                                    Dangerous action required
                                  </h3>

                                  <p>
                                    PullPilot found warnings in the
                                    generated fix plan. Autonomous
                                    execution is paused until you
                                    explicitly choose how to proceed.
                                  </p>
                                </div>
                              </div>

                              <div className="danger-warning-list">
                                {mergeWarnings.map(
                                  (warning, index) => (
                                    <div
                                      className="danger-warning"
                                      key={`${warning}-${index}`}
                                    >
                                      <span>!</span>
                                      <p>{warning}</p>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="danger-confirmation-footer">
                                <div>
                                  <strong>
                                    Recommended action
                                  </strong>

                                  <span>
                                    Stop and review the generated
                                    fix before allowing autonomous
                                    execution to continue.
                                  </span>
                                </div>

                                <div className="danger-confirmation-actions">
                                  <button
                                    type="button"
                                    className="fix-stop-button"
                                    disabled={
                                      forceMergeLoading ||
                                      applyLoading
                                    }
                                    onClick={() => {
                                      setRequiresMergeConfirmation(
                                        false
                                      );

                                      setMergeWarnings([]);

                                      setExecutionStage(
                                        "STOPPED FOR REVIEW"
                                      );

                                      setFixErrorIsSafety(true);

                                      setFixError(
                                        "Autonomous execution was stopped for review. No automatic merge was performed."
                                      );
                                    }}
                                  >
                                    STOP & REVIEW
                                  </button>

                                  <button
                                    type="button"
                                    className="fix-force-merge-button"
                                    disabled={
                                      forceMergeLoading ||
                                      applyLoading
                                    }
                                    onClick={() => {
                                      void applyAllFixes(true);
                                    }}
                                  >
                                    {forceMergeLoading ? (
                                      <>
                                        <span className="spinner" />
                                        CONTINUING...
                                      </>
                                    ) : (
                                      <>
                                        MUST MERGE ANYWAY
                                        <span>↗</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </section>
                          )}
                      </section>
                    ) : null}

                    {hasExecutableFix &&
                      !applyLoading &&
                      !requiresMergeConfirmation && (
                        <div className="apply-fix-area">
                          <div>
                            <div className="card-kicker">
                              NEXT ACTION
                            </div>

                            <h3>
                              {executionMode === "autonomous"
                                ? "Ready to execute autonomously?"
                                : "Ready to create the review PR?"}
                            </h3>

                            <p>
                              {executionMode === "autonomous"
                                ? "PullPilot will apply the consolidated plan, verify the target files and PR HEAD, run safety and CI checks, and automatically merge only when GitHub confirms the operation is safe."
                                : "PullPilot will apply the consolidated plan, verify the target files and PR HEAD, and create a review-ready PR for your approval."}
                            </p>
                          </div>

                          <button
                            type="button"
                            className={`apply-fix-button ${
                              executionMode === "autonomous"
                                ? "autonomous"
                                : "human"
                            }`}
                            disabled={
                              generatedFix.changes.length === 0
                            }
                            onClick={() => {
                              void applyAllFixes(false);
                            }}
                          >
                            {executionMode === "autonomous" ? (
                              <>
                                ⚡ APPLY ALL FIXES & AUTO MERGE
                                <span>↗</span>
                              </>
                            ) : (
                              <>
                                ✓ APPLY FIX & CREATE REVIEW PR
                                <span>↗</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                    {applyResult && (
                      <section
                        className={`apply-success ${
                          applyMerged ? "merged" : "review"
                        }`}
                      >
                        <div className="apply-success-icon">
                          ✓
                        </div>

                        <div className="apply-success-content">
                          <div className="apply-success-kicker">
                            {applyMerged
                              ? "GITHUB VERIFIED"
                              : "REVIEW WORKFLOW"}
                          </div>

                          <strong>
                            {applyMerged
                              ? "AUTONOMOUS MERGE COMPLETED"
                              : "REVIEW PR CREATED"}
                          </strong>

                          <p>{applyResult}</p>

                          <div className="apply-success-meta">
                            {applyResultUrl && (
                              <a
                                href={applyResultUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="apply-success-link"
                              >
                                {executionBlocked
                                  ? "VIEW FIX PR ↗"
                                  : executionMode === "autonomous"
                                    ? "VIEW MERGED PR ↗"
                                    : "VIEW REVIEW PR ↗"}
                              </a>
                            )}

                            {applyMerged && applyMergeSha && (
                              <a
                                href={`https://github.com/${owner}/${repo}/commit/${applyMergeSha}`}
                                target="_blank"
                                rel="noreferrer"
                                className="apply-success-link"
                              >
                                VIEW MERGE COMMIT ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                </section>
              )}

              <section className="fix-pipeline panel">
                <div className="pipeline-copy">
                  <div className="card-kicker">
                    FIX ENGINE
                  </div>

                  <h3>
                    From finding to review-ready PR.
                  </h3>

                  <p>
                    PullPilot turns engineering findings
                    into a consolidated, validated,
                    reviewable patch instead of stopping at
                    AI-generated advice.
                  </p>
                </div>

                <div className="pipeline">
                  {[
                    ["01", "GENERATE"],
                    ["02", "VALIDATE"],
                    ["03", "TEST"],
                    ["04", "REVIEW-READY PR"],
                  ].map(([num, label], index) => (
                    <div
                      className={`pipeline-step ${
                        hasExecutableFix &&
                        index === 0
                          ? "complete"
                          : ""
                      }`}
                      key={label}
                    >
                      <span>{num}</span>
                      <strong>{label}</strong>

                      {index < 3 && <i>→</i>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="footer">
          <span>PullPilot AI</span>

          <span>
            GitHub + OpenRouter · Developer Intelligence
          </span>
        </footer>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}

function RiskGauge({
  score,
}: {
  score: number;
}) {
  const safe = Math.max(
    0,
    Math.min(100, score)
  );

  const angle = -180 + safe * 1.8;
  const radians =
    (angle * Math.PI) / 180;

  const x =
    50 + 42 * Math.cos(radians);

  const y =
    52 + 42 * Math.sin(radians);

  return (
    <div className="gauge">
      <svg
        viewBox="0 0 100 62"
        aria-label={`Engineering score ${safe} out of 100`}
      >
        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          className="gauge-track"
        />

        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          className="gauge-danger"
          pathLength="100"
          strokeDasharray="34 66"
        />

        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          className="gauge-warn"
          pathLength="100"
          strokeDasharray="33 67"
          strokeDashoffset="-34"
        />

        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          className="gauge-good"
          pathLength="100"
          strokeDasharray="33 67"
          strokeDashoffset="-67"
        />

        <line
          x1="50"
          y1="52"
          x2={x}
          y2={y}
          className="gauge-needle"
        />

        <circle
          cx="50"
          cy="52"
          r="3.2"
          className="gauge-center"
        />
      </svg>

      <div className="gauge-value">
        <strong>{safe}</strong>
        <span>/100</span>
      </div>

      <div className="gauge-caption">
        ENGINEERING HEALTH
      </div>
    </div>
  );
}

function RadarChart({
  categories,
}: {
  categories: Array<{
    label: string;
    value: number;
    tone: string;
    icon: string;
  }>;
}) {
  const max = Math.max(
    ...categories.map((x) => x.value),
    1
  );

  const center = 100;

  const points = categories
    .map((item, index) => {
      const angle =
        ((-90 + index * 90) * Math.PI) /
        180;

      const radius =
        62 *
        (0.25 +
          (item.value / max) * 0.65);

      return `${
        center +
        Math.cos(angle) * radius
      },${
        center +
        Math.sin(angle) * radius
      }`;
    })
    .join(" ");

  const axes = [0, 1, 2, 3].map(
    (index) => {
      const angle =
        ((-90 + index * 90) * Math.PI) /
        180;

      return {
        x:
          center +
          Math.cos(angle) * 72,
        y:
          center +
          Math.sin(angle) * 72,
      };
    }
  );

  return (
    <div className="radar">
      <svg viewBox="0 0 200 200">
        <polygon
          points="100,28 172,100 100,172 28,100"
          className="radar-grid outer"
        />

        <polygon
          points="100,52 148,100 100,148 52,100"
          className="radar-grid"
        />

        <polygon
          points="100,76 124,100 100,124 76,100"
          className="radar-grid"
        />

        {axes.map((axis, index) => (
          <line
            key={index}
            x1="100"
            y1="100"
            x2={axis.x}
            y2={axis.y}
            className="radar-axis"
          />
        ))}

        <polygon
          points={points}
          className="radar-shape"
        />

        {categories.map(
          (item, index) => {
            const angle =
              ((-90 + index * 90) *
                Math.PI) /
              180;

            const radius =
              62 *
              (0.25 +
                (item.value / max) *
                  0.65);

            return (
              <circle
                key={item.label}
                cx={
                  center +
                  Math.cos(angle) *
                    radius
                }
                cy={
                  center +
                  Math.sin(angle) *
                    radius
                }
                r="3.5"
                className="radar-point"
              />
            );
          }
        )}
      </svg>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone: string;
}) {
  return (
    <div
      className={`metric-card ${tone}`}
    >
      <div className="metric-top">
        <span>{label}</span>

        <span className="metric-icon">
          {icon}
        </span>
      </div>

      <div className="metric-value">
        {value}
      </div>

      <div className="metric-description">
        Detected review signals
      </div>
    </div>
  );
}

function FindingGroup({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: string;
  items: string[];
  tone: string;
}) {
  const [open, setOpen] =
    useState(true);

  return (
    <article
      className={`finding-group panel ${tone}`}
    >
      <button
        type="button"
        className="finding-group-head"
        onClick={() => setOpen(!open)}
      >
        <div className="finding-title">
          <span className="diff-marker">
            {icon}
          </span>

          <div>
            <span className="finding-type">
              CATEGORY
            </span>

            <h3>{title}</h3>
          </div>
        </div>

        <div className="finding-head-right">
          <span className="finding-total">
            {items.length}
          </span>

          <span className="chevron">
            {open ? "⌃" : "⌄"}
          </span>
        </div>
      </button>

      {open && (
        <div className="finding-list">
          {items.length === 0 ? (
            <div className="finding-empty">
              No {title.toLowerCase()} detected.
            </div>
          ) : (
            items.map((item, index) => (
              <div
                className="finding-item"
                key={`${item}-${index}`}
              >
                <span className="finding-sign">
                  {icon}
                </span>

                <div className="finding-text">
                  <span className="finding-index mono">
                    SIGNAL{" "}
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </span>

                  <p>{item}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}

function riskClass(risk: string) {
  const normalized =
    risk.toLowerCase();

  if (normalized.includes("high")) {
    return "high";
  }

  if (normalized.includes("medium")) {
    return "medium";
  }

  return "low";
}
