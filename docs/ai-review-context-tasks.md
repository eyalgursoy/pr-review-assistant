# AI Review Context Awareness — Tasks

---

## File Roles (Read This First)

This implementation uses **three coordinated files**. Each has a specific purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[ai-review-context-plan.md](ai-review-context-plan.md)** | Master plan with detailed specifications | Reference for implementation details, code snippets, and requirements |
| **[ai-review-context-tasks.md](ai-review-context-tasks.md)** (THIS FILE) | Task checklist with completion status | Check/update task progress, see what's done vs pending |
| **[ai-review-context-summary.md](ai-review-context-summary.md)** | Running summary of completed work | **READ BEFORE EACH TASK** to understand prior context |

### For AI Agents: How to Use This File

**BEFORE starting a task:**
1. First, READ [ai-review-context-summary.md](ai-review-context-summary.md) to understand prior work
2. Then, check THIS file to see which task is next (first unchecked task)
3. Reference the [plan file](ai-review-context-plan.md) for implementation details
4. Create a new branch for the task (e.g. `task/1-inject-host-comments-into-prompt`)

**AFTER completing a task:**
1. Check off ALL items for the completed task in THIS file
2. Update [ai-review-context-summary.md](ai-review-context-summary.md) with a detailed summary
3. Follow version rules (bump version, README, CHANGELOG) before committing
4. Commit both tracking files with the code changes

---

## Status Legend

- [ ] Not started
- [x] Completed
- [~] In progress

---

## Task 1: Inject Existing Host Comments into AI Prompt

**Branch:** `task/1-inject-host-comments-into-prompt`

- [x] Branch created
- [x] `buildReviewPrompt` accepts optional `existingComments: ReviewComment[]`
- [x] "Already Filed Comments" section added to prompt when host comments exist
- [x] `runReview()` passes host comments to `buildReviewPrompt`
- [x] Tests added in `src/review-template.test.ts`
- [x] `npm run build` passes
- [x] `npm test` passes (272/272)
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Changes committed with proper message
- [x] `docs/ai-review-context-summary.md` updated

---

## Task 2: Deduplicate AI Comments Before Adding

**Branch:** `task/2-dedup-ai-comments`

- [x] Branch created
- [x] `deduplicateComments(incoming, existing)` added to `src/state.ts`
- [x] `runReview()` calls deduplicate before `addComments`
- [x] "No new issues" message when all duplicates
- [x] Tests added in `src/state.test.ts`
- [x] `npm run build` passes
- [x] `npm test` passes (277/277)
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Changes committed with proper message
- [x] `docs/ai-review-context-summary.md` updated

---

## Task 3: Clear Stale AI Comments Before Re-run

**Branch:** `task/3-clear-ai-comments-on-rerun`

- [ ] Branch created
- [ ] `clearAIComments()` added to `src/state.ts`
- [ ] `runReview()` calls `clearAIComments()` when AI comments exist
- [ ] Host comments preserved
- [ ] Tests added in `src/state.test.ts`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run package` creates .vsix
- [ ] Version bumped, README/CHANGELOG updated
- [ ] Changes committed with proper message
- [ ] `docs/ai-review-context-summary.md` updated

---

## Task 4: Persist Local Comment Statuses Across Sessions

**Branch:** `task/4-persist-comment-statuses`

- [ ] Branch created
- [ ] `buildStatusStorageKey` and `PersistedStatuses` in `src/state.ts`
- [ ] Status saved to `workspaceState` on approve/reject
- [ ] Statuses restored in `loadPR()` after host comments loaded
- [ ] Tests added in `src/state.test.ts` and `src/extension.test.ts`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run package` creates .vsix
- [ ] Version bumped, README/CHANGELOG updated
- [ ] Changes committed with proper message
- [ ] `docs/ai-review-context-summary.md` updated

---

## Final Checklist

- [ ] All 4 tasks completed
- [ ] All tests passing
- [ ] Extension packaged successfully
- [ ] Manual testing completed
- [ ] Ready for release
