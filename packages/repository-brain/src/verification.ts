import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface VerificationResult {
  success: boolean;
  command: string;
  output: string;
  error?: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

function isPlaceholderTestScript(
  script?: string
): boolean {
  if (!script) {
    return true;
  }

  const normalized = script
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized.includes("no test specified") ||
    normalized.includes(
      'echo "error: no test specified"'
    ) ||
    normalized.includes(
      "echo 'error: no test specified'"
    ) ||
    normalized.includes("exit 1")
  );
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  try {
    const result = await execFileAsync(
      command,
      args,
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      }
    );

    const output = [
      result.stdout ?? "",
      result.stderr ?? "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      success: true,
      output,
    };
  } catch (error: any) {
    const output = [
      error?.stdout ?? "",
      error?.stderr ?? "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      success: false,
      output,
      error:
        error instanceof Error
          ? error.message
          : "Command execution failed.",
    };
  }
}

export async function verifyRepository(
  repositoryPath: string
): Promise<VerificationResult> {
  const packageJsonPath = path.join(
    repositoryPath,
    "package.json"
  );

  let packageJson: PackageJson;

  /*
   * -------------------------------------------------------
   * 1. READ PACKAGE.JSON
   * -------------------------------------------------------
   */

  try {
    const raw = await readFile(
      packageJsonPath,
      "utf8"
    );

    packageJson = JSON.parse(raw);
  } catch {
    return {
      success: false,
      command: "read package.json",
      output: "",
      error:
        "Unable to read or parse package.json.",
    };
  }

  const scripts = packageJson.scripts ?? {};

  const pnpmCommand =
    process.platform === "win32"
      ? "pnpm.cmd"
      : "pnpm";

  const outputs: string[] = [];
  const executedCommands: string[] = [];

  let verificationPassed = true;

  /*
   * -------------------------------------------------------
   * 2. TEST VERIFICATION
   * -------------------------------------------------------
   */

  if (
    !scripts.test ||
    isPlaceholderTestScript(scripts.test)
  ) {
    outputs.push(
      [
        "TEST: not configured",
        "No meaningful test suite is configured in package.json.",
      ].join("\n")
    );
  } else {
    const commandString =
      `${pnpmCommand} test`;

    executedCommands.push(commandString);

    console.log(
      `PullPilot verification: ${commandString}`
    );

    const result = await runCommand(
      pnpmCommand,
      ["test"],
      repositoryPath
    );

    if (result.success) {
      outputs.push(
        [
          "TEST: passed",
          result.output,
        ]
          .filter(Boolean)
          .join("\n")
      );

      console.log(
        `Verification passed: ${commandString}`
      );
    } else {
      verificationPassed = false;

      outputs.push(
        [
          "TEST: failed",
          result.output,
          result.error
            ? `Error: ${result.error}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      console.error(
        `Verification failed: ${commandString}`
      );
    }
  }

  /*
   * -------------------------------------------------------
   * 3. BUILD VERIFICATION
   * -------------------------------------------------------
   */

  if (!scripts.build) {
    outputs.push(
      [
        "BUILD: not configured",
        "No build script is configured in package.json.",
      ].join("\n")
    );
  } else {
    const commandString =
      `${pnpmCommand} build`;

    executedCommands.push(commandString);

    console.log(
      `PullPilot verification: ${commandString}`
    );

    const result = await runCommand(
      pnpmCommand,
      ["build"],
      repositoryPath
    );

    if (result.success) {
      outputs.push(
        [
          "BUILD: passed",
          result.output,
        ]
          .filter(Boolean)
          .join("\n")
      );

      console.log(
        `Build verification passed: ${commandString}`
      );
    } else {
      verificationPassed = false;

      outputs.push(
        [
          "BUILD: failed",
          result.output,
          result.error
            ? `Error: ${result.error}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      console.error(
        `Build verification failed: ${commandString}`
      );
    }
  }

  /*
   * -------------------------------------------------------
   * 4. FINAL RESULT
   * -------------------------------------------------------
   */

  const command =
    executedCommands.length > 0
      ? executedCommands.join(" && ")
      : "verification skipped";

  return {
    success: verificationPassed,
    command,
    output: outputs.join("\n\n"),
  };
}