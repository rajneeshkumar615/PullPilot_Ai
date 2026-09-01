import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function runValidation(
  repoPath: string
): Promise<ValidationResult> {
  try {
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