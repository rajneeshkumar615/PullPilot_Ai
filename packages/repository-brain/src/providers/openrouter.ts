import dotenv from "dotenv";
import OpenAI from "openai";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is not configured."
  );
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer":
      process.env.OPENROUTER_SITE_URL ??
      "http://localhost:3000",

    "X-Title":
      process.env.OPENROUTER_APP_NAME ??
      "PullPilot AI",
  },
});

const primaryModel =
  process.env.OPENROUTER_MODEL ??
  "poolside/laguna-s-2.1:free";

const defaultFallbackModels = [
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free",
];

const fallbackModels = (
  process.env.OPENROUTER_FALLBACK_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean) ??
  defaultFallbackModels
);

const modelFallbackChain = Array.from(
  new Set([
    primaryModel,
    ...fallbackModels,
  ])
);

const MAX_RETRIES = Number(
  process.env.OPENROUTER_MAX_RETRIES ?? 2
);

const BASE_RETRY_DELAY_MS = Number(
  process.env.OPENROUTER_RETRY_DELAY_MS ?? 1200
);

const MAX_RETRY_DELAY_MS = 8000;

const pullPilotAnalysisResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "pullpilot_pr_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
        },

        risk: {
          type: "string",
          enum: [
            "LOW",
            "MEDIUM",
            "HIGH",
          ],
        },

        score: {
          type: "number",
        },

        bugs: {
          type: "array",
          items: {
            type: "string",
          },
        },

        security: {
          type: "array",
          items: {
            type: "string",
          },
        },

        performance: {
          type: "array",
          items: {
            type: "string",
          },
        },

        maintainability: {
          type: "array",
          items: {
            type: "string",
          },
        },

        recommendations: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },

      required: [
        "summary",
        "risk",
        "score",
        "bugs",
        "security",
        "performance",
        "maintainability",
        "recommendations",
      ],
    },
  },
};

const pullPilotFixSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
    },

    risk: {
      type: "string",
      enum: [
        "LOW",
        "MEDIUM",
        "HIGH",
      ],
    },

    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
          },

          explanation: {
            type: "string",
          },

          before: {
            type: "string",
          },

          after: {
            type: "string",
          },
        },

        required: [
          "path",
          "explanation",
          "before",
          "after",
        ],
      },
    },

    tests: {
      type: "array",
      items: {
        type: "string",
      },
    },

    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },

  required: [
    "summary",
    "risk",
    "changes",
    "tests",
    "warnings",
  ],
};

const pullPilotFixTool = {
  type: "function",
  function: {
    name: "pullpilot_pr_fix",

    description:
      "Generate a consolidated PullPilot PR fix plan containing exact file paths, exact BEFORE code, replacement AFTER code, tests, warnings, and overall risk.",

    strict: true,

    parameters: pullPilotFixSchema,
  },
};

function getErrorStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (
    status === 408 ||
    status === 409 ||
    status === 429
  ) {
    return true;
  }

  if (
    typeof status === "number" &&
    status >= 500 &&
    status <= 599
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes("rate limit") ||
    message.includes("rate-limited") ||
    message.includes("temporarily unavailable") ||
    message.includes("upstream") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("service unavailable") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("unterminated string") ||
    message.includes("unexpected end of json") ||
    message.includes("invalid json")
  );
}

function getRetryDelay(attempt: number): number {
  const exponentialDelay =
    BASE_RETRY_DELAY_MS *
    Math.pow(2, attempt);

  const cappedDelay = Math.min(
    exponentialDelay,
    MAX_RETRY_DELAY_MS
  );

  const jitter =
    Math.floor(
      Math.random() *
      Math.min(500, cappedDelay * 0.25)
    );

  return cappedDelay + jitter;
}

function sleep(
  milliseconds: number
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function extractMessageContent(
  response: OpenAI.Chat.Completions.ChatCompletion
): string {
  const message = response.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (content == null) {
    return "";
  }

  // Some OpenAI-compatible providers may return structured content
  // even though the SDK type declares message.content as string|null.
  const parts = content as unknown as Array<{
    type?: string;
    text?: string;
  }>;

  if (Array.isArray(parts)) {
    return parts
      .map((part) =>
        typeof part?.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();
  }

  return "";
}

function parseJson<T>(content: string): T {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace !== -1 &&
      lastBrace > firstBrace
    ) {
      return JSON.parse(
        cleaned.slice(
          firstBrace,
          lastBrace + 1
        )
      ) as T;
    }

    throw new Error(
      "OpenRouter returned invalid JSON."
    );
  }
}

async function requestWithRetry<T>(
  operation: (
    models: string[]
  ) => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `[PullPilot AI] ${operationName} attempt ${
          attempt + 1
        }/${MAX_RETRIES + 1}`
      );

      console.log(
        `[PullPilot AI] Model fallback chain: ${modelFallbackChain.join(
          " -> "
        )}`
      );

      return await operation(
        modelFallbackChain
      );
    } catch (error) {
      lastError = error;

      const status =
        getErrorStatus(error);

      const retryable =
        isRetryableError(error);

      console.error(
        `[PullPilot AI] ${operationName} failed.`,
        {
          attempt: attempt + 1,
          status,
          retryable,
          error,
        }
      );

      if (
        !retryable ||
        attempt >= MAX_RETRIES
      ) {
        throw error;
      }

      const delay =
        getRetryDelay(attempt);

      console.warn(
        `[PullPilot AI] Retrying ${operationName} in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `${operationName} failed.`
      );
}

export class OpenRouterProvider {
  /**
   * Analyze a pull request.
   */
  async analyze(
  prompt: string
): Promise<string> {
    return requestWithRetry(
      async (models) => {
        const response =
          await client.chat.completions.create(
            {
              model: models[0],
              messages: [
                {
                  role: "system",
                  content:
                    "You are PullPilot AI, an expert software engineering code reviewer. Analyze the supplied pull request context. Identify concrete bugs, security issues, performance problems, maintainability concerns, and actionable recommendations. Return ONLY valid JSON matching the requested structure. Do not generate or apply code fixes in this stage.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.1,
              max_tokens: 12000,
              extra_body: {
                models,
              },
            } as any
          );

        const actualModel =
          response.model ??
          "unknown";

        console.log(
          `[PullPilot AI] Analysis served by model: ${actualModel}`
        );

        const choice =
          response.choices?.[0];

        const content =
          extractMessageContent(response);

        if (!content) {
          console.error(
            "[PullPilot AI] OpenRouter analysis response contained no usable content.",
            {
              model: response.model,
              finishReason:
                choice?.finish_reason,
              message: choice?.message,
            }
          );

          throw new Error(
            "OpenRouter returned an empty analysis response."
          );
        }

        console.log(
          "========== RAW AI ANALYSIS RESPONSE =========="
        );

        console.log(content);

        console.log(
          "=============================================="
        );

        const parsed = parseJson<{
          summary: string;
          risk: "LOW" | "MEDIUM" | "HIGH";
          score: number;
          bugs: string[];
          security: string[];
          performance: string[];
          maintainability: string[];
          recommendations: string[];
        }>(content);

        return JSON.stringify(parsed);
      },
      "PR analysis"
    );
  }

  /**
   * Generate a PullPilot fix plan.
   */
  async generateFix(
  prompt: string
): Promise<string> {
    return requestWithRetry(
      async (models) => {
        const response =
          await client.chat.completions.create(
            {
              model: models[0],

              messages: [
                {
                  role: "system",
                  content:
                    "You are PullPilot AI's PR Fix Engine. Generate ONE safe, reviewable, consolidated fix plan for the supplied pull request findings. STRICT CHANGE RULES: 1. Produce at most ONE change object for each unique repository-relative file path. 2. NEVER return multiple change objects for the same file. 3. If multiple findings affect the same file, CONSOLIDATE them into the single change object for that file. 4. The BEFORE field must contain one exact contiguous block of code that already exists in the PR HEAD. 5. The AFTER field must contain the complete replacement for that exact BEFORE block. 6. Do not create overlapping changes, partially overlapping changes, or multiple edits to the same file. 7. Do not invent files, paths, functions, variables, imports, or code that is not supported by the supplied repository context. 8. Preserve unrelated code exactly as much as possible. 9. Prefer the smallest safe replacement that resolves all applicable findings for that file. 10. If several findings require changes in different locations of the same file, combine those edits into ONE coherent BEFORE/AFTER replacement covering all required locations. 11. Before returning the plan, internally check every change.path. If any path appears more than once, merge those changes into one change object. 12. If a finding cannot be safely fixed from the supplied repository context, do not invent a fix. Put the issue in warnings instead. 13. Include tests that should verify the consolidated changes. 14. Include warnings for anything that could not be safely verified. 15. Use the pullpilot_pr_fix tool exactly once. The resulting plan must be directly reviewable and safe for PullPilot's exact-match and overlap validation.",
                },

                {
                  role: "user",
                  content: prompt,
                },
              ],

              temperature: 0.1,

              max_tokens: 12000,

              reasoning: {
                effort: "none",
              },

              tools: [
                pullPilotFixTool,
              ],

              tool_choice: {
                type: "function",
                function: {
                  name: "pullpilot_pr_fix",
                },
              },

              parallel_tool_calls: false,

              extra_body: {
                models,
              },
            } as any
          );

        const actualModel =
          response.model ??
          "unknown";

        console.log(
          `[PullPilot AI] Fix generation served by model: ${actualModel}`
        );

        const message =
          response.choices?.[0]?.message;

        const toolCall =
          message?.tool_calls?.find(
            (call) =>
              call.type === "function" &&
              call.function?.name ===
                "pullpilot_pr_fix"
          );

        if (
          toolCall &&
          toolCall.type === "function"
        ) {
          const argumentsText =
            toolCall.function?.arguments;

          if (
            typeof argumentsText !==
            "string"
          ) {
            throw new Error(
              "PullPilot fix tool call did not contain valid arguments."
            );
          }

          const parsed =
            parseJson(argumentsText);

          return JSON.stringify(parsed);
        }

        const content =
          extractMessageContent(response);

        if (content) {
          const parsed = parseJson(content);

          return JSON.stringify(parsed);
        }

        throw new Error(
          "OpenRouter returned neither a PullPilot fix tool call nor structured JSON."
        );
      },

      "PR fix generation"
    );
  }
}