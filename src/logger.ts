/**
 * Logging utility for PR Review Assistant
 * Outputs to a dedicated VS Code Output Channel for debugging
 */

import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Check if verbose logging is enabled (logs diff/response content)
 */
export function isVerboseLogging(): boolean {
  return vscode.workspace.getConfiguration("prReview").get<boolean>("verboseLogging", false);
}

/**
 * Initialize the output channel
 */
export function initLogger(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("PR Review Assistant");
  context.subscriptions.push(outputChannel);
  log("PR Review Assistant logger initialized");
}

/**
 * Log a message to the output channel
 */
export function log(message: string, data?: unknown): void {
  if (!outputChannel) {
    console.log(`[PR Review] ${message}`, data);
    return;
  }

  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);

  if (data !== undefined) {
    if (typeof data === "string") {
      outputChannel.appendLine(`  Data: ${data}`);
    } else {
      try {
        const jsonStr = JSON.stringify(data, null, 2);
        outputChannel.appendLine(`  Data: ${jsonStr}`);
      } catch {
        outputChannel.appendLine(`  Data: [Unable to stringify]`);
      }
    }
  }
}

/**
 * Log an error
 */
export function logError(message: string, error?: unknown): void {
  if (!outputChannel) {
    console.error(`[PR Review ERROR] ${message}`, error);
    return;
  }

  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ERROR: ${message}`);

  if (error) {
    if (error instanceof Error) {
      outputChannel.appendLine(`  Error: ${error.message}`);
      if (error.stack) {
        outputChannel.appendLine(`  Stack: ${error.stack}`);
      }
    } else {
      outputChannel.appendLine(`  Error: ${String(error)}`);
    }
  }
}

/**
 * Log a section header for better readability
 */
export function logSection(title: string): void {
  if (!outputChannel) {
    console.log(`\n=== ${title} ===\n`);
    return;
  }

  outputChannel.appendLine("");
  outputChannel.appendLine(`${"=".repeat(60)}`);
  outputChannel.appendLine(`  ${title}`);
  outputChannel.appendLine(`${"=".repeat(60)}`);
  outputChannel.appendLine("");
}

/**
 * Show the output channel
 */
export function showLog(): void {
  outputChannel?.show();
}

/**
 * Get the output channel (for direct access if needed)
 */
export function getOutputChannel(): vscode.OutputChannel | undefined {
  return outputChannel;
}
