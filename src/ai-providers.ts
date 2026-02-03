/**
 * AI Provider implementations for code review
 * Supports: Anthropic, OpenAI, Gemini, Groq, VS Code Language Model API
 */

import * as vscode from "vscode";
import { log, logError, logSection } from "./logger";
import type {
  AIProvider,
  AIReviewOutput,
  ReviewComment,
  Severity,
} from "./types";

/**
 * System prompt with explicit JSON schema and instructions
 */
const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer analyzing a pull request diff.

## Your Task
1. Write a brief SUMMARY of the PR changes (max 200 characters)
2. Review ALL the code changes thoroughly and identify ALL potential issues across ALL files

Focus on:
- Bugs, logical errors, and edge cases
- Security vulnerabilities  
- Performance problems
- Missing error handling
- Type safety issues
- Code quality and best practices violations

## CRITICAL: Response Format
You MUST respond with ONLY a valid JSON object. No markdown, no explanations, no text before or after the JSON.

The JSON must follow this EXACT schema:

{
  "summary": "Brief 1-2 sentence summary of what this PR does and overall code quality (max 200 chars)",
  "findings": [
    {
      "file": "exact/path/to/file.ts",
      "line": 42,
      "severity": "high",
      "issue": "Clear description of the problem",
      "suggestion": "How to fix it"
    }
  ]
}

## Field Requirements
- "summary": String - brief PR summary, MAX 200 characters, no newlines
- "file": String - exact file path as shown in the diff (without a/ or b/ prefix)
- "line": Number - line number in the NEW file version (lines with + prefix in diff)
- "severity": String - exactly one of: "critical", "high", "medium", "low"
- "issue": String - concise description of the problem (no newlines)
- "suggestion": String - how to fix it (no newlines)

## Important Rules
1. ALWAYS include a "summary" field - this is required
2. Review the ENTIRE diff - check ALL files, not just the first one
3. Report ALL issues you find, not just one
4. Use the exact file path from the diff header (e.g., "src/components/Button.tsx")
5. Line numbers must be from the NEW file (+ lines), not the old file (- lines)
6. Keep string values on a single line - no newlines inside strings
7. Return valid JSON only - no markdown code blocks, no explanatory text

## If No Issues Found
If the code looks good with no issues, still include a summary:
{"summary": "Clean implementation with good practices. No issues found.", "findings": []}

## Example Response
{"summary": "Adds user auth with JWT tokens. Generally solid but needs error handling improvements.", "findings": [{"file": "src/api/client.ts", "line": 45, "severity": "high", "issue": "Missing error handling for network request", "suggestion": "Wrap fetch call in try-catch and handle errors"}, {"file": "src/utils/validate.ts", "line": 12, "severity": "low", "issue": "Type assertion could be replaced with type guard", "suggestion": "Use a type guard function for better type safety"}]}`;

/**
 * Get the configured AI provider
 */
export function getAIProvider(): AIProvider {
  const config = vscode.workspace.getConfiguration("prReview");
  return config.get<AIProvider>("aiProvider", "none");
}

/**
 * Get API key for a provider
 */
export function getAPIKey(provider: AIProvider): string | undefined {
  const config = vscode.workspace.getConfiguration("prReview");

  switch (provider) {
    case "anthropic":
      return config.get<string>("anthropicApiKey");
    case "openai":
      return config.get<string>("openaiApiKey");
    case "gemini":
      return config.get<string>("geminiApiKey");
    case "groq":
      return config.get<string>("groqApiKey");
    default:
      return undefined;
  }
}

/**
 * Result from AI review including summary and comments
 */
export interface AIReviewResult {
  summary: string;
  comments: ReviewComment[];
}

/**
 * Call AI to review the diff
 */
export async function runAIReview(
  diff: string,
  template: string
): Promise<AIReviewResult> {
  const provider = getAIProvider();

  logSection("AI REVIEW REQUEST");
  log(`Provider: ${provider}`);
  log(`Diff length: ${diff.length} characters`);
  log(`Diff preview (first 500 chars):`, diff.substring(0, 500));

  if (provider === "none") {
    throw new Error(
      "No AI provider configured. Set prReview.aiProvider in settings."
    );
  }

  const apiKey = getAPIKey(provider);
  if (!apiKey && provider !== "vscode-lm") {
    throw new Error(
      `API key not configured for ${provider}. Set prReview.${provider}ApiKey in settings.`
    );
  }

  const truncatedDiff = truncateDiff(diff);
  log(`Truncated diff length: ${truncatedDiff.length} characters`);

  const userPrompt = `${template}

---

## Code Diff to Review

Review ALL files and ALL changes in this diff. Report ALL issues found.
Include a brief summary (max 200 chars) of the PR and your overall assessment.

\`\`\`diff
${truncatedDiff}
\`\`\`

IMPORTANT: 
1. Include a "summary" field with a brief description of the PR (max 200 chars)
2. Review the ENTIRE diff and report ALL issues across ALL files`;

  log(`User prompt length: ${userPrompt.length} characters`);

  let response: string;

  try {
    switch (provider) {
      case "anthropic":
        response = await callAnthropic(apiKey!, userPrompt);
        break;
      case "openai":
        response = await callOpenAI(apiKey!, userPrompt);
        break;
      case "gemini":
        response = await callGemini(apiKey!, userPrompt);
        break;
      case "groq":
        response = await callGroq(apiKey!, userPrompt);
        break;
      case "vscode-lm":
        response = await callVSCodeLM(userPrompt);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (error) {
    logError("AI API call failed", error);
    throw error;
  }

  logSection("AI RESPONSE");
  log(`Response length: ${response.length} characters`);
  log(`Full response:`, response);

  const result = parseAIResponse(response);

  logSection("PARSED RESULT");
  log(`Summary: ${result.summary}`);
  log(`Total comments parsed: ${result.comments.length}`);
  result.comments.forEach((c, i) => {
    log(`Comment ${i + 1}:`, {
      file: c.file,
      line: c.line,
      severity: c.severity,
      issue: c.issue.substring(0, 100) + (c.issue.length > 100 ? "..." : ""),
    });
  });

  return result;
}

/**
 * Truncate diff if too long
 */
function truncateDiff(diff: string, maxLength = 150000): string {
  if (diff.length <= maxLength) return diff;

  log(`Diff truncated from ${diff.length} to ${maxLength} characters`);
  const truncated = diff.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");
  return (
    truncated.slice(0, lastNewline) + "\n\n... (diff truncated due to length)"
  );
}

/**
 * Parse AI response into AIReviewResult with summary and comments
 */
function parseAIResponse(response: string): AIReviewResult {
  logSection("PARSING AI RESPONSE");

  const defaultResult: AIReviewResult = {
    summary: "Code review completed.",
    comments: [],
  };

  if (!response || response.trim() === "") {
    log("Empty AI response, returning default result");
    return defaultResult;
  }

  let jsonStr = response.trim();
  log(`Raw response length: ${jsonStr.length}`);

  // Step 1: Try to extract JSON from markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
    log("Extracted JSON from markdown code block");
  }

  // Step 2: Find the JSON object boundaries
  const startIdx = jsonStr.indexOf("{");
  const endIdx = jsonStr.lastIndexOf("}");

  log(`JSON boundaries: start=${startIdx}, end=${endIdx}`);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    // No JSON object found - check if it's a "no issues" response
    const lowerResponse = response.toLowerCase();
    if (
      lowerResponse.includes("no issues") ||
      lowerResponse.includes("no findings") ||
      lowerResponse.includes("looks good") ||
      lowerResponse.includes("no problems")
    ) {
      log("AI indicated no issues found (text response)");
      return { summary: "No issues found. Code looks good!", comments: [] };
    }
    logError("Could not find JSON object boundaries in response");
    throw new Error(
      "Could not find JSON object in AI response. The AI may have returned an invalid format."
    );
  }

  jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  log(`Extracted JSON length: ${jsonStr.length}`);
  log(`Extracted JSON preview:`, jsonStr.substring(0, 500));

  // Step 3: Clean up common JSON issues
  jsonStr = cleanJsonString(jsonStr);

  // Step 4: Parse the JSON
  try {
    log("Attempting to parse JSON...");
    const data: AIReviewOutput = JSON.parse(jsonStr);
    log("JSON parsed successfully");
    log(`Parsed object keys:`, Object.keys(data));

    // Extract summary (truncate to 256 chars max)
    let summary = defaultResult.summary;
    if (data.summary && typeof data.summary === "string") {
      summary = sanitizeString(data.summary).substring(0, 256);
      log(`Extracted summary: ${summary}`);
    } else {
      log("No summary in response, using default");
    }

    // Validate structure
    if (!data || typeof data !== "object") {
      log("Parsed data is not an object");
      return { summary, comments: [] };
    }

    // Handle case where findings is missing or null
    if (!data.findings) {
      log("No 'findings' property in parsed data");
      return { summary, comments: [] };
    }

    if (!Array.isArray(data.findings)) {
      log(`'findings' is not an array, type: ${typeof data.findings}`);
      return { summary, comments: [] };
    }

    log(`Number of findings in response: ${data.findings.length}`);

    // Handle empty findings
    if (data.findings.length === 0) {
      log("AI returned empty findings array - no issues found");
      return { summary, comments: [] };
    }

    // Map and validate each finding
    const comments: ReviewComment[] = [];

    for (let idx = 0; idx < data.findings.length; idx++) {
      const f = data.findings[idx];
      log(`Processing finding ${idx + 1}/${data.findings.length}:`, f);

      // Skip invalid findings
      if (!f || typeof f !== "object") {
        log(`  Skipping: not an object`);
        continue;
      }

      // Validate required fields
      if (!f.file || typeof f.file !== "string") {
        log(`  Skipping: missing or invalid 'file' field`);
        continue;
      }

      if (typeof f.line !== "number" || f.line < 1) {
        // Try to parse line as number if it's a string
        const parsedLine = parseInt(String(f.line), 10);
        if (isNaN(parsedLine) || parsedLine < 1) {
          log(`  Skipping: invalid 'line' field: ${f.line}`);
          continue;
        }
        f.line = parsedLine;
      }

      if (!f.issue || typeof f.issue !== "string") {
        log(`  Skipping: missing or invalid 'issue' field`);
        continue;
      }

      // Clean the file path (remove "a/" or "b/" prefix if present)
      let filePath = f.file.trim();
      if (filePath.startsWith("a/") || filePath.startsWith("b/")) {
        filePath = filePath.substring(2);
        log(`  Cleaned file path: ${filePath}`);
      }

      const comment: ReviewComment = {
        id: `comment-${Date.now()}-${idx}`,
        file: filePath,
        line: Math.floor(f.line),
        endLine: f.endLine ? Math.floor(f.endLine) : undefined,
        severity: normalizeSeverity(f.severity),
        issue: sanitizeString(f.issue),
        suggestion: f.suggestion ? sanitizeString(f.suggestion) : undefined,
        codeSnippet: f.codeSnippet ? sanitizeString(f.codeSnippet) : undefined,
        status: "pending",
      };

      log(`  Created comment:`, {
        file: comment.file,
        line: comment.line,
        severity: comment.severity,
      });
      comments.push(comment);
    }

    log(`Successfully parsed ${comments.length} valid comments`);
    return { summary, comments };
  } catch (e) {
    logError("JSON parse error", e);
    log("Failed JSON string:", jsonStr.substring(0, 2000));

    // Try one more time with aggressive cleaning
    try {
      log("Attempting aggressive JSON cleaning...");
      const aggressivelyCleaned = aggressiveJsonClean(jsonStr);
      log("Aggressively cleaned JSON:", aggressivelyCleaned.substring(0, 500));

      const data: AIReviewOutput = JSON.parse(aggressivelyCleaned);
      const fallbackSummary = data.summary
        ? sanitizeString(data.summary).substring(0, 256)
        : "Code review completed.";

      if (data.findings && Array.isArray(data.findings)) {
        log(
          `Aggressive clean succeeded, found ${data.findings.length} findings`
        );
        const fallbackComments = data.findings.map((f, idx) => ({
          id: `comment-${Date.now()}-${idx}`,
          file: String(f.file || "unknown").replace(/^[ab]\//, ""),
          line: Number(f.line) || 1,
          severity: normalizeSeverity(f.severity),
          issue: sanitizeString(String(f.issue || "Unknown issue")),
          suggestion: f.suggestion
            ? sanitizeString(String(f.suggestion))
            : undefined,
          status: "pending" as const,
        }));
        return { summary: fallbackSummary, comments: fallbackComments };
      }
    } catch (e2) {
      logError("Aggressive clean also failed", e2);
    }

    throw new Error(
      "Failed to parse AI response. The AI returned invalid JSON. Check the Output panel for details."
    );
  }
}

/**
 * Clean common JSON formatting issues
 */
function cleanJsonString(jsonStr: string): string {
  let cleaned = jsonStr;

  // Remove BOM and other invisible characters
  cleaned = cleaned.replace(/^\uFEFF/, "");

  // Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return cleaned;
}

/**
 * Aggressive JSON cleaning for recovery
 */
function aggressiveJsonClean(jsonStr: string): string {
  let cleaned = jsonStr;

  // Remove any non-JSON content before the first {
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) {
    cleaned = cleaned.substring(firstBrace);
  }

  // Remove any content after the last }
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  }

  // Try to fix common issues
  cleaned = cleaned
    .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double
    .replace(/\r/g, "") // Remove carriage returns
    .replace(/\t/g, " "); // Replace tabs with spaces

  return cleaned;
}

/**
 * Sanitize a string value (remove problematic characters)
 */
function sanitizeString(str: string): string {
  if (!str) return "";

  return str
    .replace(/[\x00-\x1F\x7F]/g, " ") // Remove control characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Normalize severity to valid values
 */
function normalizeSeverity(s: string | undefined): Severity {
  if (!s) return "medium";

  const lower = String(s).toLowerCase().trim();

  if (lower === "critical" || lower === "crit") return "critical";
  if (lower === "high" || lower === "hi") return "high";
  if (lower === "medium" || lower === "med" || lower === "moderate")
    return "medium";
  if (lower === "low" || lower === "lo" || lower === "minor") return "low";

  return "medium";
}

/**
 * Anthropic Claude
 */
async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  log("Calling Anthropic Claude API...");
  const module = await import("@anthropic-ai/sdk");
  const Anthropic = module.default || module;
  const client = new (Anthropic as any)({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16384,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  log("Anthropic API response received");
  const textBlock = response.content.find((b: any) => b.type === "text");
  return textBlock?.text || '{"findings": []}';
}

/**
 * OpenAI GPT-4o
 */
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  log("Calling OpenAI API...");
  const module = await import("openai");
  const OpenAI = module.default || module;
  const client = new (OpenAI as any)({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 16384,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  log("OpenAI API response received");
  return response.choices[0]?.message?.content || '{"findings": []}';
}

/**
 * Google Gemini 2.5 Flash
 */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  log("Calling Google Gemini API...");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
    },
  });

  const result = await model.generateContent([
    { text: REVIEW_SYSTEM_PROMPT },
    { text: prompt },
  ]);

  log("Gemini API response received");
  return result.response.text() || '{"findings": []}';
}

/**
 * Groq (Llama 3.3 70B)
 */
async function callGroq(apiKey: string, prompt: string): Promise<string> {
  log("Calling Groq API...");
  const module = await import("groq-sdk");
  const Groq = module.default || module;
  const client = new (Groq as any)({ apiKey });

  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 16384,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  log("Groq API response received");
  return response.choices[0]?.message?.content || '{"findings": []}';
}

/**
 * VS Code Language Model API (Cursor/Copilot)
 */
async function callVSCodeLM(prompt: string): Promise<string> {
  log("Calling VS Code Language Model API...");

  // Check if Language Model API is available
  if (!vscode.lm) {
    throw new Error(
      "VS Code Language Model API not available. Make sure you have Copilot or Cursor AI enabled."
    );
  }

  // Get available models
  const models = await vscode.lm.selectChatModels({
    vendor: "copilot",
  });

  if (models.length === 0) {
    // Try without vendor filter
    const allModels = await vscode.lm.selectChatModels({});
    if (allModels.length === 0) {
      throw new Error(
        "No language models available. Enable GitHub Copilot or Cursor AI."
      );
    }
    models.push(...allModels);
  }

  const model = models[0];
  log(`Using model: ${model.name || model.id}`);

  const messages = [
    vscode.LanguageModelChatMessage.User(
      REVIEW_SYSTEM_PROMPT + "\n\n" + prompt
    ),
  ];

  const response = await model.sendRequest(messages, {});

  let result = "";
  for await (const chunk of response.text) {
    result += chunk;
  }

  log("VS Code LM API response received");
  return result || '{"findings": []}';
}
