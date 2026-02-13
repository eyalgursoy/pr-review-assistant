/**
 * Secure API key storage using VS Code SecretStorage
 * Stores credentials in OS credential manager instead of plain text settings
 */

import * as vscode from "vscode";

const SECRET_KEYS: Record<string, string> = {
  anthropic: "prReview.anthropicApiKey",
  openai: "prReview.openaiApiKey",
  gemini: "prReview.geminiApiKey",
  groq: "prReview.groqApiKey",
  gitlab: "prReview.gitlabToken",
  bitbucket: "prReview.bitbucketToken",
};

let secretStorage: vscode.SecretStorage | undefined;

export function initSecretStorage(context: vscode.ExtensionContext): void {
  secretStorage = context.secrets;
}

export async function getApiKey(provider: string): Promise<string | undefined> {
  if (!secretStorage) return undefined;
  const key = SECRET_KEYS[provider];
  if (!key) return undefined;
  return await secretStorage.get(key);
}

export async function setApiKey(
  provider: string,
  value: string
): Promise<void> {
  if (!secretStorage) return;
  const key = SECRET_KEYS[provider];
  if (!key) return;
  await secretStorage.store(key, value);
}

export async function deleteApiKey(provider: string): Promise<void> {
  if (!secretStorage) return;
  const key = SECRET_KEYS[provider];
  if (!key) return;
  await secretStorage.delete(key);
}
