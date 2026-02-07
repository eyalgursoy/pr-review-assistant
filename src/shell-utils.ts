/**
 * Secure shell execution utilities
 * Uses execFile (no shell) to prevent command injection
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

/** GitHub owner/repo: alphanumeric, -, _, . (GitHub allowed chars) */
const GITHUB_OWNER_REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/** Branch names: alphanumeric, /, _, ., - (Git refs) */
const BRANCH_REGEX = /^[a-zA-Z0-9/_.-]+$/;

/** Stash ref: stash@{0}, stash@{1}, etc. */
const STASH_REF_REGEX = /^stash@\{\d+\}$/;

/** Safe path chars for git paths (no .. or leading /) */
const GIT_PATH_REGEX = /^[a-zA-Z0-9/_.-]+$/;

/** Shell metacharacters that could enable command injection */
const UNSAFE_SHELL_CHARS = /[;$|&"'`()\\\n]/;

export interface ExecFileOptions {
  cwd?: string;
  maxBuffer?: number;
  timeout?: number;
}

/**
 * Execute a command with arguments (no shell - prevents injection)
 */
export async function runCommand(
  cmd: string,
  args: string[],
  opts: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const { cwd, maxBuffer = 10 * 1024 * 1024, timeout } = opts;
  const result = await execFileAsync(cmd, args, {
    encoding: "utf-8",
    cwd,
    maxBuffer,
    timeout,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Validate GitHub owner or repo name - throws if invalid
 */
export function validateOwnerRepo(value: string, field: string): void {
  if (!value || typeof value !== "string") {
    throw new Error(`Invalid ${field}: empty or not a string`);
  }
  if (!GITHUB_OWNER_REPO_REGEX.test(value)) {
    throw new Error(
      `Invalid ${field}: must contain only letters, numbers, - and _`
    );
  }
}

/**
 * Validate branch/ref name - throws if invalid
 */
export function validateBranchName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Invalid branch name: empty or not a string");
  }
  if (name.includes("..")) {
    throw new Error("Invalid branch name: path traversal not allowed");
  }
  if (!BRANCH_REGEX.test(name)) {
    throw new Error(
      "Invalid branch name: contains disallowed characters (allowed: a-z, A-Z, 0-9, /, _, ., -)"
    );
  }
}

/**
 * Validate stash ref (stash@{n}) - throws if invalid
 */
export function validateStashRef(ref: string): void {
  if (!ref || typeof ref !== "string") {
    throw new Error("Invalid stash ref: empty or not a string");
  }
  if (!STASH_REF_REGEX.test(ref.trim())) {
    throw new Error("Invalid stash ref: must match stash@{n} format");
  }
}

/**
 * Validate file path for git operations - prevents path traversal
 * Returns normalized path if valid, throws if path escapes repo
 */
export function validateGitPath(filePath: string, cwd: string): string {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path: empty or not a string");
  }
  // Reject paths with ..
  if (filePath.includes("..")) {
    throw new Error("Invalid file path: path traversal not allowed");
  }
  // Reject absolute paths
  if (path.isAbsolute(filePath)) {
    throw new Error("Invalid file path: absolute paths not allowed");
  }
  // Allow only safe chars
  if (!GIT_PATH_REGEX.test(filePath)) {
    throw new Error(
      "Invalid file path: contains disallowed characters (allowed: a-z, A-Z, 0-9, /, _, ., -)"
    );
  }
  // Resolve and ensure within cwd
  const resolved = path.resolve(cwd, filePath);
  const resolvedCwd = path.resolve(cwd);
  if (!resolved.startsWith(resolvedCwd + path.sep) && resolved !== resolvedCwd) {
    throw new Error("Invalid file path: path escapes repository");
  }
  return filePath;
}

/**
 * Validate executable path - throws if contains shell metacharacters
 */
export function validateExecutablePath(execPath: string): void {
  if (!execPath || typeof execPath !== "string") {
    throw new Error("Invalid executable path: empty or not a string");
  }
  if (UNSAFE_SHELL_CHARS.test(execPath)) {
    throw new Error(
      "Invalid executable path: contains disallowed shell metacharacters"
    );
  }
}

/**
 * Create a secure temporary file path with cryptographically random name
 * Prevents predictable file names that could be guessed by attackers
 */
export function createSecureTempFile(
  prefix: string,
  extension: string
): string {
  const randomPart = crypto.randomBytes(16).toString("hex");
  const fileName = `${prefix}-${randomPart}${extension}`;
  return path.join(os.tmpdir(), fileName);
}

/**
 * Create a secure temp file with content and restrictive permissions (0600)
 */
export async function writeSecureTempFile(
  prefix: string,
  extension: string,
  content: string
): Promise<string> {
  const filePath = createSecureTempFile(prefix, extension);
  await fs.promises.writeFile(filePath, content, {
    encoding: "utf-8",
    mode: 0o600,
  });
  return filePath;
}
