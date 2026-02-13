/**
 * Core types for PR Review Assistant
 */

export type CommentStatus = "pending" | "approved" | "rejected";

export type Severity = "critical" | "high" | "medium" | "low";

/**
 * Side of the diff the comment applies to:
 * - RIGHT: Added lines (green, +) or unchanged context lines
 * - LEFT: Deleted lines (red, -)
 */
export type DiffSide = "LEFT" | "RIGHT";

export type AIProvider =
  | "cursor-cli"
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
  /**
   * Which side of the diff this comment applies to:
   * - RIGHT (default): For added lines (+) or context lines
   * - LEFT: For deleted lines (-)
   */
  side: DiffSide;
  severity: Severity;
  issue: string;
  suggestion?: string;
  codeSnippet?: string;
  status: CommentStatus;
  editedText?: string;
}

/** Supported git hosts for PR/MR review */
export type HostType = "github" | "gitlab" | "bitbucket";

/**
 * Information about a PR (or MR on GitLab, PR on Bitbucket)
 */
export interface PRInfo {
  number: number;
  owner: string;
  repo: string;
  title: string;
  headBranch: string;
  baseBranch: string;
  url: string;
  host: HostType;
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
  /** True when reviewing local branch diff (no GitHub PR) */
  isLocalMode: boolean;
  files: ChangedFile[];
  diff: string;
  summary: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Expected JSON output from AI
 */
export interface AIReviewOutput {
  summary: string;
  findings: Array<{
    file: string;
    line: number;
    endLine?: number;
    side?: "LEFT" | "RIGHT";
    severity: string;
    issue: string;
    suggestion?: string;
    codeSnippet?: string;
  }>;
}
