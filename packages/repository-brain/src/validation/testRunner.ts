 import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
  error?: string;
}

function isPlaceholderTestScript(testScript: unknown): boolean {
  if (typeof testScript !== "string") {
    return true;
  }

  const normalized = testScript
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return (
    normalized === "" ||
    normalized === "exit 1" ||
    normalized.includes("no test specified") ||
    normalized.includes("no tests specified") ||
    normalized.includes("error: no test") ||
    normalized.includes("echo \"error: no test") ||
    normalized.includes("echo 'error: no test")
  );
}

export async function runValidation(
  repoPath: string
): Promise<ValidationResult> {
  try {
    const packageJsonPath = path.join(repoPath, "package.json");
    const packageJsonRaw = await readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);

    const testScript = packageJson?.scripts?.test;

    if (isPlaceholderTestScript(testScript)) {
      return {
        passed: true,
        command: "no meaningful test suite configured",
        stdout:
          "No meaningful test suite is configured in package.json.",
        stderr: "",
      };
    }

    const { stdout, stderr } = await execFileAsync(
      "npm",
      ["test"],
      {
        cwd: repoPath,
        timeout: 120_000,
        windowsHide: true,
      }
    );

    return {
      passed: true,
      command: "npm test",
      stdout,
      stderr,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: "npm test",
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? "",
      error: error?.message ?? "Tests failed",
    };
  }
}
