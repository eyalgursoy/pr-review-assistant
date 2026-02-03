/**
 * Streaming progress tracking for AI review
 * Shows real-time status updates in the TreeView
 */

import * as vscode from "vscode";
import { log } from "./logger";

/**
 * Progress state for streaming AI review
 */
export interface StreamingProgress {
  stage: ProgressStage;
  message: string;
  details?: string;
  tokensReceived: number;
  tokensInput: number;
  elapsedMs: number;
  estimatedCost: number;
  currentFile?: string;
  filesAnalyzed: string[];
}

export type ProgressStage =
  | "idle"
  | "fetching-pr"
  | "loading-diff"
  | "preparing-prompt"
  | "ai-analyzing"
  | "ai-streaming"
  | "parsing-response"
  | "complete"
  | "error";

/**
 * Provider pricing per 1M tokens (input/output)
 */
const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  anthropic: { input: 3.0, output: 15.0 },
  openai: { input: 2.5, output: 10.0 },
  gemini: { input: 0.075, output: 0.3 },
  groq: { input: 0.59, output: 0.79 },
  "vscode-lm": { input: 0, output: 0 }, // Free with Copilot subscription
};

// Global progress state
let currentProgress: StreamingProgress = createInitialProgress();
let progressEmitter = new vscode.EventEmitter<StreamingProgress>();
let startTime: number = 0;

export const onProgressChange = progressEmitter.event;

/**
 * Create initial progress state
 */
function createInitialProgress(): StreamingProgress {
  return {
    stage: "idle",
    message: "",
    tokensReceived: 0,
    tokensInput: 0,
    elapsedMs: 0,
    estimatedCost: 0,
    filesAnalyzed: [],
  };
}

/**
 * Get current progress
 */
export function getProgress(): StreamingProgress {
  return { ...currentProgress };
}

/**
 * Reset progress to initial state
 */
export function resetProgress(): void {
  currentProgress = createInitialProgress();
  progressEmitter.fire(currentProgress);
}

/**
 * Start tracking a new review
 */
export function startProgress(): void {
  startTime = Date.now();
  currentProgress = {
    ...createInitialProgress(),
    stage: "fetching-pr",
    message: "Fetching PR information...",
  };
  progressEmitter.fire(currentProgress);
  log("Progress started: fetching-pr");
}

/**
 * Update progress stage
 */
export function updateStage(
  stage: ProgressStage,
  message: string,
  details?: string
): void {
  currentProgress = {
    ...currentProgress,
    stage,
    message,
    details,
    elapsedMs: Date.now() - startTime,
  };
  progressEmitter.fire(currentProgress);
  log(`Progress: ${stage} - ${message}`);
}

/**
 * Update streaming progress with token count
 */
export function updateStreamingProgress(
  tokensReceived: number,
  streamedText?: string,
  provider?: string
): void {
  const elapsedMs = Date.now() - startTime;

  // Try to extract what file is being analyzed from the streamed text
  let currentFile = currentProgress.currentFile;
  const filesAnalyzed = [...currentProgress.filesAnalyzed];

  if (streamedText) {
    // Look for file paths in the streamed content
    const fileMatch = streamedText.match(/"file"\s*:\s*"([^"]+)"/g);
    if (fileMatch) {
      const lastMatch = fileMatch[fileMatch.length - 1];
      const pathMatch = lastMatch.match(/"file"\s*:\s*"([^"]+)"/);
      if (pathMatch && pathMatch[1]) {
        currentFile = pathMatch[1];
        if (!filesAnalyzed.includes(currentFile)) {
          filesAnalyzed.push(currentFile);
        }
      }
    }
  }

  // Calculate estimated cost
  const estimatedCost = calculateCost(
    currentProgress.tokensInput,
    tokensReceived,
    provider || "anthropic"
  );

  currentProgress = {
    ...currentProgress,
    stage: "ai-streaming",
    message: currentFile
      ? `Analyzing ${getFileName(currentFile)}...`
      : "AI analyzing code...",
    tokensReceived,
    elapsedMs,
    estimatedCost,
    currentFile,
    filesAnalyzed,
  };
  progressEmitter.fire(currentProgress);
}

/**
 * Set input token count (for cost calculation)
 */
export function setInputTokens(tokens: number): void {
  currentProgress = {
    ...currentProgress,
    tokensInput: tokens,
  };
}

/**
 * Mark progress as complete
 */
export function completeProgress(issuesFound: number, provider?: string): void {
  const elapsedMs = Date.now() - startTime;
  const estimatedCost = calculateCost(
    currentProgress.tokensInput,
    currentProgress.tokensReceived,
    provider || "anthropic"
  );

  currentProgress = {
    ...currentProgress,
    stage: "complete",
    message: `Review complete`,
    details: `${issuesFound} issue${issuesFound !== 1 ? "s" : ""} found`,
    elapsedMs,
    estimatedCost,
  };
  progressEmitter.fire(currentProgress);
  log(
    `Progress complete: ${issuesFound} issues, ${
      currentProgress.tokensReceived
    } tokens, $${estimatedCost.toFixed(4)}`
  );
}

/**
 * Mark progress as error
 */
export function errorProgress(errorMessage: string): void {
  currentProgress = {
    ...currentProgress,
    stage: "error",
    message: "Review failed",
    details: errorMessage,
    elapsedMs: Date.now() - startTime,
  };
  progressEmitter.fire(currentProgress);
  log(`Progress error: ${errorMessage}`);
}

/**
 * Calculate estimated cost based on provider pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  provider: string
): number {
  const pricing = PROVIDER_PRICING[provider] || PROVIDER_PRICING.anthropic;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Get just the filename from a path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1];
}

/**
 * Format elapsed time for display
 */
export function formatElapsedTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "free";
  if (cost < 0.001) return "<$0.001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
}

/**
 * Estimate tokens from text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
