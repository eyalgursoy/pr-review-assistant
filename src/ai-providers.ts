/**
 * AI Provider implementations for code review
 * Supports: Anthropic, OpenAI, Gemini, Groq, VS Code Language Model API
 */

import * as vscode from "vscode";
import type {
  AIProvider,
  AIReviewOutput,
  ReviewComment,
  Severity,
} from "./types";

const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer. Review the provided code diff and identify issues.

Focus on:
- Bugs and logical errors
- Security vulnerabilities
- Performance issues
- Code quality and best practices
- Missing error handling
- Type safety issues

For each issue, provide:
1. File path (exactly as shown in the diff)
2. Line number (use the NEW file line numbers, lines starting with +)
3. Severity: critical, high, medium, or low
4. Clear description of the issue
5. Suggested fix

Output ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "high",
      "issue": "Description of the issue",
      "suggestion": "How to fix it",
      "codeSnippet": "optional corrected code"
    }
  ]
}

If no issues found, return: {"findings": []}
Do not include any text outside the JSON.`;

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
 * Call AI to review the diff
 */
export async function runAIReview(
  diff: string,
  template: string
): Promise<ReviewComment[]> {
  const provider = getAIProvider();

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

  const userPrompt = `${template}\n\n---\n\n## Code Diff\n\n\`\`\`diff\n${truncateDiff(
    diff
  )}\n\`\`\``;

  let response: string;

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

  return parseAIResponse(response);
}

/**
 * Truncate diff if too long
 */
function truncateDiff(diff: string, maxLength = 100000): string {
  if (diff.length <= maxLength) return diff;

  const truncated = diff.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");
  return truncated.slice(0, lastNewline) + "\n\n... (diff truncated)";
}

/**
 * Parse AI response into ReviewComment array
 */
function parseAIResponse(response: string): ReviewComment[] {
  // Try to extract JSON from response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Find JSON object
  const startIdx = jsonStr.indexOf("{");
  const endIdx = jsonStr.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1) {
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  }

  try {
    const data: AIReviewOutput = JSON.parse(jsonStr);

    if (!data.findings || !Array.isArray(data.findings)) {
      return [];
    }

    return data.findings.map((f, idx) => ({
      id: `comment-${Date.now()}-${idx}`,
      file: f.file,
      line: f.line,
      endLine: f.endLine,
      severity: normalizeSeverity(f.severity),
      issue: f.issue,
      suggestion: f.suggestion,
      codeSnippet: f.codeSnippet,
      status: "pending",
    }));
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    throw new Error(
      "Failed to parse AI response. The AI may have returned invalid JSON."
    );
  }
}

function normalizeSeverity(s: string): Severity {
  const lower = s?.toLowerCase();
  if (["critical", "high", "medium", "low"].includes(lower)) {
    return lower as Severity;
  }
  return "medium";
}

/**
 * Anthropic Claude
 */
async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const module = await import("@anthropic-ai/sdk");
  const Anthropic = module.default || module;
  const client = new (Anthropic as any)({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b: any) => b.type === "text");
  return textBlock?.text || "";
}

/**
 * OpenAI GPT-4o
 */
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const module = await import("openai");
  const OpenAI = module.default || module;
  const client = new (OpenAI as any)({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Google Gemini 2.5 Flash
 */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: REVIEW_SYSTEM_PROMPT },
    { text: prompt },
  ]);

  return result.response.text();
}

/**
 * Groq (Llama 3.3 70B)
 */
async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const module = await import("groq-sdk");
  const Groq = module.default || module;
  const client = new (Groq as any)({ apiKey });

  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * VS Code Language Model API (Cursor/Copilot)
 */
async function callVSCodeLM(prompt: string): Promise<string> {
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

  return result;
}
