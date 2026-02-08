/**
 * Load custom rules from workspace .pr-review-rules.json
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { ReviewRuleSet } from "./index";

export interface CustomRulesConfig {
  extends?: string[];
  focusAreas?: string[];
  antiPatterns?: string[];
  bestPractices?: string[];
  ignore?: string[];
}

/**
 * Load custom rules from .pr-review-rules.json in workspace root
 * or from prReview.customRulesPath setting
 */
export async function loadCustomRules(
  workspaceRoot: string | null
): Promise<ReviewRuleSet | null> {
  if (!workspaceRoot) return null;

  const config = vscode.workspace.getConfiguration("prReview");
  const customPath = config.get<string>("customRulesPath");

  const rulesPath = customPath
    ? path.isAbsolute(customPath)
      ? customPath
      : path.join(workspaceRoot, customPath)
    : path.join(workspaceRoot, ".pr-review-rules.json");

  try {
    const content = await fs.promises.readFile(rulesPath, "utf-8");
    const parsed = JSON.parse(content);
    const validated = validateCustomRulesConfig(parsed);

    return customConfigToRuleSet(validated);
  } catch {
    // File doesn't exist or invalid JSON - that's ok
    return null;
  }
}

/**
 * Validate and sanitize parsed JSON to ensure it conforms to CustomRulesConfig.
 * Invalid fields are replaced with undefined (which becomes empty arrays in customConfigToRuleSet).
 */
function validateCustomRulesConfig(parsed: unknown): CustomRulesConfig {
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }

  const obj = parsed as Record<string, unknown>;

  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

  return {
    extends: isStringArray(obj.extends) ? obj.extends : undefined,
    focusAreas: isStringArray(obj.focusAreas) ? obj.focusAreas : undefined,
    antiPatterns: isStringArray(obj.antiPatterns) ? obj.antiPatterns : undefined,
    bestPractices: isStringArray(obj.bestPractices) ? obj.bestPractices : undefined,
    ignore: isStringArray(obj.ignore) ? obj.ignore : undefined,
  };
}

function customConfigToRuleSet(config: CustomRulesConfig): ReviewRuleSet {
  return {
    name: "custom",
    description: "Custom rules from workspace",
    focusAreas: config.focusAreas ?? [],
    antiPatterns: config.antiPatterns ?? [],
    bestPractices: config.bestPractices ?? [],
    ignorePatterns: config.ignore,
  };
}
