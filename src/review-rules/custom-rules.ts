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
    const content = fs.readFileSync(rulesPath, "utf-8");
    const parsed = JSON.parse(content) as CustomRulesConfig;

    return customConfigToRuleSet(parsed);
  } catch {
    // File doesn't exist or invalid JSON - that's ok
    return null;
  }
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
