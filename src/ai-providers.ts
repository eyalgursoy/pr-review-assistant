/**
 * AI Provider implementations for code review
 * Supports: Anthropic, OpenAI, Gemini, Groq, VS Code Language Model API
 */

import * as vscode from "vscode";
import { log, logError, logSection } from "./logger";
import {
  updateStage,
  updateStreamingProgress,
  setInputTokens,
  completeProgress,
  errorProgress,
  estimateTokens,
} from "./streaming-progress";
import { annotateDiff } from "./diff-annotator";
import type {
  AIProvider,
  AIReviewOutput,
  ReviewComment,
  Severity,
  DiffSide,
} from "./types";

/**
 * System prompt with explicit JSON schema and instructions
 */
const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer analyzing a pull request diff.

## Your Task
1. Write a brief encouraging SUMMARY that provides qualitative feedback (max 200 characters)
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
  "summary": "Encouraging feedback about code quality and what's good (max 200 chars)",
  "findings": [
    {
      "file": "exact/path/to/file.ts",
      "line": 42,
      "side": "RIGHT",
      "severity": "high",
      "issue": "Clear description of the problem",
      "suggestion": "How to fix it"
    }
  ]
}

## IMPORTANT: Summary Field Guidelines
The summary should be QUALITATIVE FEEDBACK, not a description of what the PR does. 
- DO NOT describe what changes were made (the developer already knows this)
- DO provide encouraging feedback about code quality, architecture, or patterns
- DO acknowledge what's done well before mentioning improvements needed
- DO inspire the developer to address the findings

Good summary examples:
- "Well-structured implementation! Addressing the edge cases below will make it production-ready."
- "Clean code with good separation of concerns. A few minor improvements suggested."
- "Excellent work! Code is clean, well-organized, and follows best practices."
- "Solid foundation here. The suggested changes will improve error resilience."
- "Good progress! The highlighted items will strengthen maintainability."

Bad summary examples (DO NOT do this):
- "Adds user authentication with JWT tokens" (just describes what changed)
- "Updates the API client and adds validation" (just describes what changed)
- "Refactors the database layer" (just describes what changed)

## IMPORTANT: Annotated Line Numbers
The diff you receive has been annotated with EXACT line numbers. Each line has a prefix showing:
- \`[OLD:X|NEW:Y]\` - Context line: X is old file line, Y is new file line
- \`[NEW:X|ADD]\` - Added line: X is the new file line number
- \`[OLD:X|DEL]\` - Deleted line: X is the old file line number

**USE THESE ANNOTATED LINE NUMBERS DIRECTLY** - they are the exact line numbers you should report.

## Field Requirements
- "summary": String - encouraging qualitative feedback, MAX 200 characters, no newlines
- "file": String - exact file path as shown in the diff (without a/ or b/ prefix)
- "line": Number - **USE THE ANNOTATED LINE NUMBER** from the diff:
  - For lines marked \`[NEW:X|ADD]\` or \`[OLD:X|NEW:Y]\`, use X or Y based on side
  - For lines marked \`[OLD:X|DEL]\`, use X
- "side": String - MUST be either "RIGHT" or "LEFT":
  - Use "RIGHT" for ADDED lines (\`[NEW:X|ADD]\`) or context lines - use the NEW line number
  - Use "LEFT" for DELETED lines (\`[OLD:X|DEL]\`) - use the OLD line number
- "severity": String - exactly one of: "critical", "high", "medium", "low"
- "issue": String - concise description of the problem (no newlines)
- "suggestion": String - how to fix it (no newlines)

## Example Annotated Diff
\`\`\`
@@ -10,5 +12,7 @@
[OLD:10|NEW:12]  context line (unchanged)
[OLD:11|DEL] -deleted line
[NEW:13|ADD] +added line
[OLD:12|NEW:14]  another context
\`\`\`

For this diff:
- To comment on the deleted line: \`"line": 11, "side": "LEFT"\`
- To comment on the added line: \`"line": 13, "side": "RIGHT"\`
- To comment on context lines: use the NEW number, e.g., \`"line": 12, "side": "RIGHT"\` or \`"line": 14, "side": "RIGHT"\`

## Important Rules
1. ALWAYS include a "summary" field with encouraging qualitative feedback - this is required
2. ALWAYS include "side" field for each finding - this is required for accurate GitHub comments
3. **ALWAYS use the annotated line numbers** - do not calculate line numbers yourself
4. Review the ENTIRE diff - check ALL files, not just the first one
5. Report ALL issues you find, not just one
6. Use the exact file path from the diff header (e.g., "src/components/Button.tsx")
7. Keep string values on a single line - no newlines inside strings
8. Return valid JSON only - no markdown code blocks, no explanatory text

## If No Issues Found
If the code looks good with no issues, provide positive feedback:
{"summary": "Excellent work! Clean, well-structured code that follows best practices.", "findings": []}

## Example Response
{"summary": "Well-structured implementation! Addressing these edge cases will make it production-ready.", "findings": [{"file": "src/api/client.ts", "line": 45, "side": "RIGHT", "severity": "high", "issue": "Missing error handling for network request", "suggestion": "Wrap fetch call in try-catch and handle errors"}, {"file": "src/utils/validate.ts", "line": 12, "side": "RIGHT", "severity": "low", "issue": "Type assertion could be replaced with type guard", "suggestion": "Use a type guard function for better type safety"}, {"file": "src/old-code.ts", "line": 8, "side": "LEFT", "severity": "medium", "issue": "Removed validation that was important", "suggestion": "Consider keeping the validation or adding equivalent checks elsewhere"}]}`;

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

  updateStage("preparing-prompt", "Preparing AI prompt...");

  if (provider === "none") {
    errorProgress("No AI provider configured");
    throw new Error(
      "No AI provider configured. Set prReview.aiProvider in settings."
    );
  }

  const apiKey = getAPIKey(provider);
  if (!apiKey && provider !== "vscode-lm" && provider !== "cursor-cli") {
    errorProgress(`API key not configured for ${provider}`);
    throw new Error(
      `API key not configured for ${provider}. Set prReview.${provider}ApiKey in settings.`
    );
  }

  const truncatedDiff = truncateDiff(diff);
  log(`Truncated diff length: ${truncatedDiff.length} characters`);

  // Annotate the diff with absolute line numbers for accuracy
  const annotatedResult = annotateDiff(truncatedDiff);
  log(
    `Annotated diff: ${annotatedResult.fileCount} files, ${annotatedResult.hunkCount} hunks`
  );
  log(
    `Annotated diff preview (first 800 chars):`,
    annotatedResult.annotated.substring(0, 800)
  );

  const userPrompt = `${template}

---

## Code Diff to Review (with annotated line numbers)

Review ALL files and ALL changes in this diff. Report ALL issues found.
Include a brief summary (max 200 chars) of the PR and your overall assessment.

**IMPORTANT: Each line is annotated with its exact line number. Use these numbers directly in your response.**
- \`[OLD:X|NEW:Y]\` = context line (use Y for "line" with "side": "RIGHT")
- \`[NEW:X|ADD]\` = added line (use X for "line" with "side": "RIGHT")
- \`[OLD:X|DEL]\` = deleted line (use X for "line" with "side": "LEFT")

\`\`\`diff
${annotatedResult.annotated}
\`\`\`

IMPORTANT: 
1. Include a "summary" field with a brief description of the PR (max 200 chars)
2. Review the ENTIRE diff and report ALL issues across ALL files
3. Use the EXACT line numbers from the annotations - do not calculate them yourself`;

  log(`User prompt length: ${userPrompt.length} characters`);

  // Estimate input tokens for cost calculation
  const inputTokens = estimateTokens(REVIEW_SYSTEM_PROMPT + userPrompt);
  setInputTokens(inputTokens);
  log(`Estimated input tokens: ${inputTokens}`);

  updateStage("ai-analyzing", "Sending to AI...", `Using ${provider}`);

  let response: string;

  try {
    switch (provider) {
      case "anthropic":
        response = await callAnthropicStreaming(apiKey!, userPrompt);
        break;
      case "openai":
        response = await callOpenAIStreaming(apiKey!, userPrompt);
        break;
      case "gemini":
        response = await callGeminiStreaming(apiKey!, userPrompt);
        break;
      case "groq":
        response = await callGroqStreaming(apiKey!, userPrompt);
        break;
      case "vscode-lm":
        response = await callVSCodeLMStreaming(userPrompt);
        break;
      case "cursor-cli":
        response = await callCursorCLI(userPrompt);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (error) {
    logError("AI API call failed", error);
    errorProgress(error instanceof Error ? error.message : "AI call failed");
    throw error;
  }

  updateStage("parsing-response", "Processing AI response...");

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

  completeProgress(result.comments.length, provider);

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
        side: normalizeSide(f.side),
        severity: normalizeSeverity(f.severity),
        issue: sanitizeString(f.issue),
        suggestion: f.suggestion ? sanitizeString(f.suggestion) : undefined,
        codeSnippet: f.codeSnippet ? sanitizeString(f.codeSnippet) : undefined,
        status: "pending",
      };

      log(`  Created comment:`, {
        file: comment.file,
        line: comment.line,
        side: comment.side,
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
          side: normalizeSide(f.side),
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
 * Normalize diff side to valid values
 * Default to RIGHT (added/context lines) if not specified
 */
function normalizeSide(s: string | undefined): DiffSide {
  if (!s) return "RIGHT";

  const upper = String(s).toUpperCase().trim();

  if (upper === "LEFT" || upper === "L") return "LEFT";
  if (upper === "RIGHT" || upper === "R") return "RIGHT";

  // Default to RIGHT for added/context lines
  return "RIGHT";
}

/**
 * Anthropic Claude with Streaming
 */
async function callAnthropicStreaming(
  apiKey: string,
  prompt: string
): Promise<string> {
  log("Calling Anthropic Claude API with streaming...");
  const module = await import("@anthropic-ai/sdk");
  const Anthropic = module.default || module;
  const client = new (Anthropic as any)({ apiKey });

  let fullResponse = "";
  let tokenCount = 0;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16384,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.text) {
      fullResponse += event.delta.text;
      tokenCount = estimateTokens(fullResponse);
      updateStreamingProgress(tokenCount, fullResponse, "anthropic");
    }
  }

  log("Anthropic API streaming complete");
  return fullResponse || '{"summary": "No response", "findings": []}';
}

/**
 * OpenAI GPT-4o with Streaming
 */
async function callOpenAIStreaming(
  apiKey: string,
  prompt: string
): Promise<string> {
  log("Calling OpenAI API with streaming...");
  const module = await import("openai");
  const OpenAI = module.default || module;
  const client = new (OpenAI as any)({ apiKey });

  let fullResponse = "";
  let tokenCount = 0;

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 16384,
    response_format: { type: "json_object" },
    stream: true,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      tokenCount = estimateTokens(fullResponse);
      updateStreamingProgress(tokenCount, fullResponse, "openai");
    }
  }

  log("OpenAI API streaming complete");
  return fullResponse || '{"summary": "No response", "findings": []}';
}

/**
 * Google Gemini 2.5 Flash with Streaming
 */
async function callGeminiStreaming(
  apiKey: string,
  prompt: string
): Promise<string> {
  log("Calling Google Gemini API with streaming...");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
    },
  });

  let fullResponse = "";
  let tokenCount = 0;

  const result = await model.generateContentStream([
    { text: REVIEW_SYSTEM_PROMPT },
    { text: prompt },
  ]);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullResponse += text;
      tokenCount = estimateTokens(fullResponse);
      updateStreamingProgress(tokenCount, fullResponse, "gemini");
    }
  }

  log("Gemini API streaming complete");
  return fullResponse || '{"summary": "No response", "findings": []}';
}

/**
 * Groq (Llama 3.3 70B) with Streaming
 */
async function callGroqStreaming(
  apiKey: string,
  prompt: string
): Promise<string> {
  log("Calling Groq API with streaming...");
  const module = await import("groq-sdk");
  const Groq = module.default || module;
  const client = new (Groq as any)({ apiKey });

  let fullResponse = "";
  let tokenCount = 0;

  const stream = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 16384,
    response_format: { type: "json_object" },
    stream: true,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      tokenCount = estimateTokens(fullResponse);
      updateStreamingProgress(tokenCount, fullResponse, "groq");
    }
  }

  log("Groq API streaming complete");
  return fullResponse || '{"summary": "No response", "findings": []}';
}

/**
 * VS Code Language Model API with Streaming
 * Works with Cursor's native AI - the recommended option for Cursor users!
 * No API key needed - uses your existing Cursor subscription.
 */
async function callVSCodeLMStreaming(prompt: string): Promise<string> {
  log("Calling VS Code Language Model API (Cursor Native AI)...");

  // Check if Language Model API is available
  if (!vscode.lm) {
    throw new Error(
      "VS Code Language Model API not available. Make sure you're using Cursor IDE with AI enabled."
    );
  }

  // Get all available models - Cursor exposes its models through this API
  const allModels = await vscode.lm.selectChatModels({});

  log(`Found ${allModels.length} available language models:`);
  allModels.forEach((m, i) => {
    log(
      `  ${i + 1}. ${m.name || m.id} (vendor: ${m.vendor}, family: ${m.family})`
    );
  });

  if (allModels.length === 0) {
    throw new Error(
      "No language models available. Make sure Cursor AI is enabled in your settings."
    );
  }

  // Prefer Claude models if available (Cursor's default), then GPT, then any
  let model = allModels.find(
    (m) =>
      m.family?.toLowerCase().includes("claude") ||
      m.name?.toLowerCase().includes("claude")
  );

  if (!model) {
    model = allModels.find(
      (m) =>
        m.family?.toLowerCase().includes("gpt") ||
        m.name?.toLowerCase().includes("gpt")
    );
  }

  if (!model) {
    model = allModels[0];
  }

  log(`Selected model: ${model.name || model.id}`);

  const messages = [
    vscode.LanguageModelChatMessage.User(
      REVIEW_SYSTEM_PROMPT + "\n\n" + prompt
    ),
  ];

  try {
    const response = await model.sendRequest(messages, {});

    let fullResponse = "";
    let tokenCount = 0;

    for await (const chunk of response.text) {
      fullResponse += chunk;
      tokenCount = estimateTokens(fullResponse);
      updateStreamingProgress(tokenCount, fullResponse, "vscode-lm");
    }

    log("Cursor Native AI streaming complete");
    return fullResponse || '{"summary": "No response", "findings": []}';
  } catch (error) {
    logError("Cursor Native AI error", error);

    if (error instanceof Error) {
      if (
        error.message.includes("denied") ||
        error.message.includes("permission")
      ) {
        throw new Error(
          "Permission denied. Please allow PR Review Assistant to use Cursor AI when prompted."
        );
      }
      if (error.message.includes("rate") || error.message.includes("limit")) {
        throw new Error(
          "Rate limit reached. Please wait a moment and try again."
        );
      }
    }
    throw error;
  }
}

/**
 * Find the Cursor CLI agent binary
 * Checks multiple possible locations since PATH may not be set correctly in VS Code
 */
async function findAgentBinary(): Promise<string | null> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const execAsync = promisify(exec);

  const homeDir = os.homedir();

  // Possible locations for the agent binary
  const possiblePaths = [
    path.join(homeDir, ".cursor", "bin", "agent"),
    path.join(homeDir, ".cursor", "cli", "agent"),
    path.join(homeDir, ".local", "bin", "agent"),
    path.join(homeDir, "bin", "agent"),
    "/usr/local/bin/agent",
    "/opt/homebrew/bin/agent",
  ];

  // Check each possible path
  for (const agentPath of possiblePaths) {
    if (fs.existsSync(agentPath)) {
      log(`Found agent at: ${agentPath}`);
      return agentPath;
    }
  }

  // Try which command as fallback (works if PATH is set correctly)
  try {
    const { stdout } = await execAsync("which agent 2>/dev/null");
    const foundPath = stdout.trim();
    if (foundPath && fs.existsSync(foundPath)) {
      log(`Found agent via which: ${foundPath}`);
      return foundPath;
    }
  } catch {
    // which failed
  }

  // Try sourcing shell config and then which
  try {
    const { stdout } = await execAsync(
      "source ~/.zshrc 2>/dev/null; which agent 2>/dev/null || source ~/.bashrc 2>/dev/null; which agent 2>/dev/null",
      { shell: "/bin/zsh" }
    );
    const foundPath = stdout.trim();
    if (foundPath && fs.existsSync(foundPath)) {
      log(`Found agent after sourcing shell config: ${foundPath}`);
      return foundPath;
    }
  } catch {
    // shell sourcing failed
  }

  log("Agent binary not found in any location");
  return null;
}

/**
 * Check if Cursor CLI is installed and ready to use
 * Returns the path to the agent binary, or null if not ready
 */
async function ensureCursorCLIInstalled(): Promise<string | null> {
  const agentPath = await findAgentBinary();

  if (!agentPath) {
    // CLI not found - prompt user to install
    const install = await vscode.window.showErrorMessage(
      "Cursor CLI not found. Install it to use your Cursor subscription for reviews.",
      "Install Now",
      "Open Docs",
      "Use Different Provider"
    );

    if (install === "Install Now") {
      const terminal = vscode.window.createTerminal("Cursor CLI Setup");
      terminal.show();
      terminal.sendText("# Installing Cursor CLI...");
      terminal.sendText("curl https://cursor.com/install -fsSL | bash");
      terminal.sendText("");
      terminal.sendText("# After installation completes:");
      terminal.sendText("# 1. Run: source ~/.zshrc  (or restart terminal)");
      terminal.sendText("# 2. Run: agent login");
      terminal.sendText("# 3. Then try the PR review again!");

      vscode.window.showInformationMessage(
        "Follow the terminal instructions. After 'agent login', try the review again."
      );
      return null;
    } else if (install === "Open Docs") {
      vscode.env.openExternal(vscode.Uri.parse("https://cursor.com/cli"));
      return null;
    } else if (install === "Use Different Provider") {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "prReview.aiProvider"
      );
      return null;
    }

    return null;
  }

  // CLI found - return the path
  log(`Using Cursor CLI at: ${agentPath}`);
  return agentPath;
}

/**
 * Cursor CLI Agent
 * Uses the Cursor CLI `agent` command for code review
 * Requires: curl https://cursor.com/install -fsSL | bash
 * No API key needed - uses your Cursor subscription!
 */
async function callCursorCLI(prompt: string): Promise<string> {
  log("Calling Cursor CLI Agent...");

  // Check if CLI is installed, offer to install if not
  const agentPath = await ensureCursorCLIInstalled();
  if (!agentPath) {
    throw new Error(
      "Cursor CLI setup required. Please install/login and try again."
    );
  }

  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Create a temporary file with the prompt (to avoid shell escaping issues)
  const os = await import("os");
  const fs = await import("fs");
  const path = await import("path");
  const tempDir = os.tmpdir();
  const promptFile = path.join(tempDir, `pr-review-prompt-${Date.now()}.txt`);

  // Combine system prompt and user prompt
  const fullPrompt = `${REVIEW_SYSTEM_PROMPT}

${prompt}

IMPORTANT: Respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`;

  fs.writeFileSync(promptFile, fullPrompt, "utf-8");
  log(`Wrote prompt to temp file: ${promptFile}`);

  try {
    updateStreamingProgress(0, "Waiting for Cursor Agent (30-60s)...", "cursor-cli");
    log("Sending prompt to Cursor Agent (this may take 30-60 seconds)...");

    // Run the agent command with -p (print mode) for non-interactive use
    // The prompt is piped via stdin as that's how the CLI expects it
    const { stdout, stderr } = await execAsync(
      `cat "${promptFile}" | "${agentPath}" -p --output-format text 2>&1`,
      {
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      }
    );

    log("Cursor CLI stdout length:", stdout?.length || 0);
    if (stderr) {
      log("Cursor CLI stderr:", stderr);
    }

    // Clean up temp file
    fs.unlinkSync(promptFile);

    // Extract JSON from the response
    const response = stdout || stderr || "";
    log("Cursor CLI response preview:", response.substring(0, 500));

    // Try to find JSON in the response (may be wrapped in markdown code blocks)
    // First try to extract from code blocks
    const codeBlockMatch = response.match(
      /```(?:json)?\s*(\{[\s\S]*?"findings"[\s\S]*?\})\s*```/
    );
    if (codeBlockMatch) {
      log("Found JSON in code block");
      updateStreamingProgress(
        estimateTokens(codeBlockMatch[1]),
        codeBlockMatch[1],
        "cursor-cli"
      );
      return codeBlockMatch[1];
    }

    // Try to find raw JSON
    const jsonMatch = response.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) {
      log("Found raw JSON in Cursor CLI response");
      updateStreamingProgress(
        estimateTokens(jsonMatch[0]),
        jsonMatch[0],
        "cursor-cli"
      );
      return jsonMatch[0];
    }

    // If no JSON found, return the raw response for parsing
    log("No JSON found in response, returning raw");
    updateStreamingProgress(estimateTokens(response), response, "cursor-cli");
    return (
      response ||
      '{"summary": "Cursor CLI returned no response", "findings": []}'
    );
  } catch (error) {
    // Clean up temp file on error
    try {
      const fs = await import("fs");
      fs.unlinkSync(promptFile);
    } catch {
      // Ignore cleanup errors
    }

    logError("Cursor CLI error", error);

    const errorMsg = error instanceof Error ? error.message : String(error);

    // Handle specific error cases
    if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
      throw new Error("Cursor CLI timed out. The review may be too large.");
    }

    if (errorMsg.includes("not found") || errorMsg.includes("ENOENT")) {
      throw new Error(
        "Cursor CLI not found. Install it with: curl https://cursor.com/install -fsSL | bash"
      );
    }

    if (
      errorMsg.includes("login") ||
      errorMsg.includes("auth") ||
      errorMsg.includes("unauthorized")
    ) {
      // Need to login
      const action = await vscode.window.showErrorMessage(
        "Cursor CLI requires login. Please authenticate first.",
        "Open Terminal to Login"
      );
      if (action === "Open Terminal to Login") {
        const terminal = vscode.window.createTerminal("Cursor CLI Login");
        terminal.show();
        terminal.sendText(`"${agentPath}" login`);
      }
      throw new Error("Please login to Cursor CLI and try again.");
    }

    if (
      errorMsg.includes("trust") ||
      errorMsg.includes("workspace") ||
      errorMsg.includes("directory")
    ) {
      // Workspace trust issue
      throw new Error(
        "Cursor CLI needs workspace approval. Run 'agent chat' in terminal first to approve this directory."
      );
    }

    throw error;
  }
}
