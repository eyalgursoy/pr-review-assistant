# Phase 2: Parser + State

Implement the review parser (JSON + markdown) and state manager for the PR Review Assistant. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Prerequisites**: Phase 1 complete - extension scaffolding, webview panel opens
- **Key files**: `src/extension.ts`, `src/webview/panel.ts`
- **Goal**: Parse AI review output and manage review state with Finding interface

## Tasks

1. **Create Finding and ReviewState types** (`src/types.ts` or inline in `src/state.ts`)

   ```typescript
   interface Finding {
     id: string;
     file: string;
     line: number;
     severity: "critical" | "high" | "medium" | "low";
     issue: string;
     suggestion?: string;
     status: "pending" | "approved" | "rejected";
     editedComment?: string;
   }

   interface ReviewState {
     prNumber: number;
     repoOwner: string;
     repoName: string;
     findings: Finding[];
     selectedFile: string | null;
   }
   ```

2. **Implement JSON parser** (`src/parser.ts`)

   - Function `parseJsonReview(input: string): Finding[]`
   - Accepts JSON with structure: `{ "findings": [ { "file", "line", "severity", "issue", "suggestion" } ] }`
   - Maps to Finding objects with generated `id` (e.g., uuid or `file:line`), default `status: 'pending'`
   - Normalize severity to valid enum (default 'medium' if invalid)
   - Return empty array on parse error

3. **Implement markdown parser** (`src/parser.ts`)

   - Function `parseMarkdownReview(input: string): Finding[]`
   - Use regex to extract blocks with pattern:
     - `**File:**` or `File:` followed by path and optional `(line N)`
     - `**Issue:**` or `Issue:` followed by text
     - `**Suggestion:**` or `Suggestion:` followed by text (optional)
   - Handle variations: backticks around file path, `(line 4)` or `line 4`
   - Default severity to 'medium' when not specified
   - Return array of Finding objects

4. **Implement unified parse function** (`src/parser.ts`)

   - `parseReview(input: string): Finding[]`
   - Try JSON parse first; if valid JSON with `findings` array, use JSON parser
   - Otherwise use markdown parser

5. **Create state manager** (`src/state.ts`)

   - `createReviewState(prNumber, repoOwner, repoName, findings): ReviewState`
   - `updateFindingStatus(state, findingId, status): ReviewState`
   - `updateFindingComment(state, findingId, editedComment): ReviewState`
   - `setSelectedFile(state, file): ReviewState`
   - Use immutable updates (return new state objects)

6. **Add unit tests**

   - Create `src/parser.test.ts` or `tests/parser.test.ts`
   - Test JSON parser: valid JSON, invalid JSON, missing fields
   - Test markdown parser: standard format, variations (with/without suggestion, different line formats)
   - Test unified parse: JSON input returns JSON result, markdown input returns markdown result
   - Use Jest or Vitest (add to package.json)

## Completion Criteria

- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all parser tests green)
- [ ] JSON parser correctly parses the example from the plan (lines 104-115)
- [ ] Markdown parser correctly parses the example from the plan (lines 119-123)
- [ ] State manager functions work (can create state, update finding status)
- [ ] No linter errors

## Verification Commands

```bash
npm run build
npm test
```

## Self-Correction Loop

1. Implement parser and state
2. Run `npm test`
3. If any test fails: read failure, fix implementation, repeat
4. Add edge case tests if needed (empty input, malformed input)

## Completion Signal

When all completion criteria are met, output:

```
PHASE_2_COMPLETE
```
