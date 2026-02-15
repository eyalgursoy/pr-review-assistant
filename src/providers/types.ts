/**
 * Provider abstraction for PR/MR review across GitHub, GitLab, Bitbucket
 */

import type { HostType, PRInfo, ChangedFile, ReviewComment } from "../types";

export interface AuthStatus {
  available: boolean;
  authenticated: boolean;
  error?: string;
}

export interface SubmitResult {
  success: boolean;
  message: string;
  url?: string;
}

export interface PRProvider {
  readonly host: HostType;

  /** Check auth (CLI or token). */
  checkAuth(): Promise<AuthStatus>;

  /** Fetch PR/MR metadata → PRInfo (with host set). */
  fetchPRInfo(
    owner: string,
    repo: string,
    number: number
  ): Promise<PRInfo>;

  /** List changed files. */
  fetchChangedFiles(
    owner: string,
    repo: string,
    number: number
  ): Promise<ChangedFile[]>;

  /** Get full diff (unified). */
  fetchPRDiff(
    owner: string,
    repo: string,
    number: number
  ): Promise<string>;

  /** Fetch existing inline review comments for the PR (optional). */
  fetchPRComments?(
    owner: string,
    repo: string,
    number: number
  ): Promise<ReviewComment[]>;

  /** Post review comments (inline). */
  submitReviewComments(
    pr: PRInfo,
    comments: ReviewComment[],
    summary?: string | null
  ): Promise<SubmitResult>;

  /** Approve PR/MR (optional; not all hosts support it the same way). */
  approvePR?(pr: PRInfo, body: string): Promise<SubmitResult>;
}
