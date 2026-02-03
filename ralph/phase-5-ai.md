# Phase 5: AI Integration

Add AI API clients (Anthropic, OpenAI) and diff fetching for direct AI review. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Prerequisites**: Phases 1-4 complete - full workflow works with paste-from-clipboard
- **Key files**: `src/ai.ts`, `src/extension.ts`, `src/parser.ts`
- **Goal**: Fetch PR diff, call AI with review template, parse response into findings

## Tasks

1. **Create AI module** (`src/ai.ts`)

   - Export `fetchReviewFromAI(params: AIReviewParams): Promise<string>`
   - Params: `{ provider: 'anthropic' | 'openai', apiKey: string, diff: string }`
   - Returns raw AI response (to be parsed by existing parser)

2. **Implement diff fetching**

   - Function `fetchPrDiff(owner: string, repo: string, prNumber: number): Promise<string>`
   - Use `gh pr diff {prNumber}` via `child_process.exec`
   - Or use Octokit `pulls.get` + compare API if token available
   - Return diff as string

3. **Create review template** (`src/review-template.ts` or inline)

   - System/user prompt that instructs AI to review the diff and output findings
   - Specify output format: either JSON `{ "findings": [...] }` or markdown blocks
   - Include examples so AI returns consistent structure

4. **Add Anthropic client**

   - Use `@anthropic-ai/sdk`
   - Call Claude with diff + template
   - Stream or wait for full response; return text

5. **Add OpenAI client**

   - Use `openai` package
   - Call GPT-4 (or configurable model) with diff + template
   - Return text

6. **Wire up "PR Review: Call AI API" command**

   - Check `prReview.aiProvider` setting (anthropic, openai, or none)
   - If none, show message "Configure prReview.aiProvider and API key"
   - Read API key from `prReview.anthropicApiKey` or `prReview.openaiApiKey` (use SecretStorage for keys)
   - Fetch diff using `fetchPrDiff`
   - Call `fetchReviewFromAI` with diff
   - Parse response with `parseReview`
   - Update state with findings, send to webview

7. **Add configuration**

   - Ensure `prReview.aiProvider`, `prReview.anthropicApiKey`, `prReview.openaiApiKey` in package.json contributes.configuration
   - Use `vscode.SecretStorage` for API keys (recommended)

## Completion Criteria

- [ ] `npm run build` succeeds
- [ ] With Anthropic API key configured: "Call AI API" fetches diff, gets review, populates findings
- [ ] With OpenAI API key configured: same
- [ ] If no API key: clear message to configure
- [ ] Review template produces parseable output (JSON or markdown)
- [ ] No API keys in logs or error messages

## Verification Commands

```bash
npm run build
```

Then: Configure API key in settings, run "PR Review: Start Review" (enter PR number), run "PR Review: Call AI API". Findings should appear.

## Self-Correction Loop

1. Implement AI clients and diff fetch
2. Test with a small PR diff
3. If AI output doesn't parse: adjust template or parser to handle variations
4. Ensure API keys are stored securely

## Completion Signal

When all completion criteria are met, output:

```
PHASE_5_COMPLETE
```
