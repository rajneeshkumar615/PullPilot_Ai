"use client";

import { FormEvent, useState } from "react";

type Analysis = {
  summary: string;
  risk: string;
  score: number;
  bugs: string[];
  security: string[];
  performance: string[];
  maintainability: string[];
  recommendations: string[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const [owner, setOwner] = useState("rajneeshkumar615");
  const [repo, setRepo] = useState("StayNest");
  const [number, setNumber] = useState("1");

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyzePR(event: FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch(`${API_URL}/api/pr/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner,
          repo,
          number: Number(number),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "PR analysis failed.");
      }

      setAnalysis({
        summary: data.summary || "No summary returned.",
        risk: data.risk || "UNKNOWN",
        score: Number(data.score ?? 0),
        bugs: Array.isArray(data.bugs) ? data.bugs : [],
        security: Array.isArray(data.security) ? data.security : [],
        performance: Array.isArray(data.performance)
          ? data.performance
          : [],
        maintainability: Array.isArray(data.maintainability)
          ? data.maintainability
          : [],
        recommendations: Array.isArray(data.recommendations)
          ? data.recommendations
          : [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to analyze PR."
      );
    } finally {
      setLoading(false);
    }
  }

  const totalFindings = analysis
    ? analysis.bugs.length +
      analysis.security.length +
      analysis.performance.length +
      analysis.maintainability.length
    : 0;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>

          <div>
            <div className="brand-name">PullPilot</div>
            <div className="brand-version">AI PR ENGINEER</div>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">WORKSPACE</div>

          <a className="nav-item active" href="#analyze">
            <span>⌁</span>
            Analyze PR
          </a>

          <a className="nav-item" href="#overview">
            <span>◫</span>
            Overview
          </a>

          <a className="nav-item" href="#findings">
            <span>◈</span>
            Findings
          </a>

          <a className="nav-item" href="#recommendations">
            <span>✦</span>
            Recommendations
          </a>
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
            PullPilot AI
            <span>v0.2.0</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">DEVELOPER INTELLIGENCE</div>
            <h1>Pull Request Review</h1>
          </div>

          <div className="engine-status">
            <span className="status-dot" />
            AI ENGINE ONLINE
          </div>
        </header>

        <div className="content">
          <section className="hero" id="analyze">
            <div className="hero-copy">
              <div className="pill">
                <span>●</span>
                GitHub connected
              </div>

              <h2>
                Understand every
                <br />
                pull request.
              </h2>

              <p>
                PullPilot analyzes repository changes, identifies
                engineering risks, and gives your team actionable
                recommendations before code reaches production.
              </p>
            </div>

            <div className="hero-glow">
              <div className="orb orb-one" />
              <div className="orb orb-two" />

              <div className="hero-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>

              <div className="hero-center">
                <div className="pilot-symbol">P</div>
                <div>AI REVIEW ENGINE</div>
              </div>
            </div>
          </section>

          <section className="analyzer-card">
            <div className="section-heading">
              <div>
                <div className="section-kicker">
                  ANALYSIS
                </div>
                <h3>Start an AI review</h3>
              </div>

              <div className="endpoint">
                POST /api/pr/analyze
              </div>
            </div>

            <form onSubmit={analyzePR} className="analyzer-form">
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
                  onChange={(e) => setNumber(e.target.value)}
                  type="number"
                  min="1"
                />
              </div>

              <button
                type="submit"
                className="analyze-button"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze PR
                    <span>→</span>
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="error-box">
                <strong>Analysis failed</strong>
                <span>{error}</span>
              </div>
            )}
          </section>

          {analysis && (
            <>
              <section className="analysis-header" id="overview">
                <div>
                  <div className="repo-label">
                    {owner}/{repo}
                  </div>

                  <h2>
                    Pull request #{number}
                  </h2>

                  <p>
                    Analyzed by PullPilot AI
                  </p>
                </div>

                <div
                  className={`risk-badge ${riskClass(
                    analysis.risk
                  )}`}
                >
                  <span />
                  {analysis.risk} RISK
                </div>
              </section>

              <section className="metrics">
                <ScoreCard
                  label="ENGINEERING SCORE"
                  value={analysis.score}
                  description="Overall PR health"
                  score
                />

                <MetricCard
                  label="BUGS"
                  value={analysis.bugs.length}
                  description="Detected issues"
                />

                <MetricCard
                  label="SECURITY"
                  value={analysis.security.length}
                  description="Security concerns"
                />

                <MetricCard
                  label="PERFORMANCE"
                  value={analysis.performance.length}
                  description="Performance concerns"
                />

                <MetricCard
                  label="MAINTAINABILITY"
                  value={analysis.maintainability.length}
                  description="Engineering concerns"
                />
              </section>

              <section className="summary-card">
                <div className="card-kicker">
                  AI SUMMARY
                </div>

                <p>{analysis.summary}</p>

                <div className="summary-meta">
                  <span>
                    {totalFindings} total findings
                  </span>

                  <span>OpenRouter AI</span>
                </div>
              </section>

              <section
                className="findings-section"
                id="findings"
              >
                <div className="section-title">
                  <div>
                    <div className="section-kicker">
                      ENGINEERING REVIEW
                    </div>

                    <h2>Findings</h2>
                  </div>

                  <span className="finding-count">
                    {totalFindings} findings
                  </span>
                </div>

                <div className="finding-grid">
                  <FindingGroup
                    title="Bugs"
                    icon="!"
                    items={analysis.bugs}
                    tone="danger"
                  />

                  <FindingGroup
                    title="Security"
                    icon="◆"
                    items={analysis.security}
                    tone="security"
                  />

                  <FindingGroup
                    title="Performance"
                    icon="↗"
                    items={analysis.performance}
                    tone="performance"
                  />

                  <FindingGroup
                    title="Maintainability"
                    icon="◇"
                    items={analysis.maintainability}
                    tone="maintainability"
                  />
                </div>
              </section>

              <section
                className="recommendations-section"
                id="recommendations"
              >
                <div className="section-title">
                  <div>
                    <div className="section-kicker">
                      AI ENGINEER
                    </div>

                    <h2>Recommended actions</h2>
                  </div>

                  <span className="ai-badge">
                    AI GENERATED
                  </span>
                </div>

                <div className="recommendations">
                  {analysis.recommendations.length === 0 ? (
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
                          <div className="recommendation-number">
                            {String(index + 1).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <div className="recommendation-body">
                            <p>{item}</p>

                            <button
                              type="button"
                              className="fix-button"
                              onClick={() =>
                                alert(
                                  "AI Fix generation is the next PullPilot phase."
                                )
                              }
                            >
                              Generate Fix
                              <span>→</span>
                            </button>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>
              </section>

              <section className="next-engine-card">
                <div className="next-engine-icon">
                  ✦
                </div>

                <div>
                  <div className="card-kicker">
                    NEXT ENGINE
                  </div>

                  <h3>
                    AI Fix generation
                  </h3>

                  <p>
                    Turn findings into reviewable code patches,
                    validate them, and prepare them for the
                    GitHub pull request.
                  </p>
                </div>

                <div className="coming-soon">
                  NEXT PHASE
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
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ScoreCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
  score?: boolean;
}) {
  const circumference = 2 * Math.PI * 42;
  const offset =
    circumference -
    (Math.max(0, Math.min(100, value)) / 100) *
      circumference;

  return (
    <div className="metric-card score-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">◎</span>
      </div>

      <div className="score-content">
        <div className="score-ring">
          <svg viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              className="score-track"
            />

            <circle
              cx="50"
              cy="50"
              r="42"
              className="score-progress"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>

          <div className="score-number">
            {value}
            <small>/100</small>
          </div>
        </div>

        <div>
          <strong>{description}</strong>
          <p>
            {value >= 90
              ? "Excellent PR health"
              : value >= 75
                ? "Healthy with some risks"
                : value >= 50
                  ? "Needs engineering attention"
                  : "High engineering risk"}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">+</span>
      </div>

      <div className="metric-value">{value}</div>

      <div className="metric-description">
        {description}
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
  return (
    <article className={`finding-card ${tone}`}>
      <div className="finding-header">
        <div className="finding-title">
          <span className="finding-icon">{icon}</span>
          <h3>{title}</h3>
        </div>

        <span className="finding-total">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="finding-empty">
          No {title.toLowerCase()} detected.
        </div>
      ) : (
        <div className="finding-list">
          {items.map((item, index) => (
            <div
              className="finding-item"
              key={`${item}-${index}`}
            >
              <span className="finding-index">
                {String(index + 1).padStart(2, "0")}
              </span>

              <p>{item}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function riskClass(risk: string) {
  const normalized = risk.toLowerCase();

  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";

  return "low";
}