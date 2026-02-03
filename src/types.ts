/**
 * Core types for PR Review Assistant
 */

export type CommentStatus = "pending" | "approved" | "rejected";

export type Severity = "critical" | "high" | "medium" | "low";

export type AIProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "vscode-lm"
  | "none";

/**
 * A single review comment/finding from AI
 */
export interface ReviewComment {
  id: string;
  file: string;
  line: number;
  endLine?: number;
  severity: Severity;
  issue: string;
  suggestion?: string;
  codeSnippet?: string;
  status: CommentStatus;
  editedText?: string;
}

/**
 * Information about a PR
 */
export interface PRInfo {
  number: number;
  owner: string;
  repo: string;
  title: string;
  headBranch: string;
  baseBranch: string;
  url: string;
}

/**
 * A file changed in the PR
 */
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  comments: ReviewComment[];
}

/**
 * The complete review state
 */
export interface ReviewState {
  pr: PRInfo | null;
  files: ChangedFile[];
  diff: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * Expected JSON output from AI
 */
export interface AIReviewOutput {
  findings: Array<{
    file: string;
    line: number;
    endLine?: number;
    severity: string;
    issue: string;
    suggestion?: string;
    codeSnippet?: string;
  }>;
}
