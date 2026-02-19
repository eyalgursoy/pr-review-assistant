# PR Comments Implementation Tasks

---

## File Roles (Read This First)

This implementation uses **three coordinated files**. Each has a specific purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[pr-comments-filter-hierarchy-plan.md](pr-comments-filter-hierarchy-plan.md)** | Master plan with detailed specifications | Reference for implementation details, code snippets, and requirements |
| **[pr-comments-tasks.md](pr-comments-tasks.md)** (THIS FILE) | Task checklist with completion status | Check/update task progress, see what's done vs pending |
| **[pr-comments-summary.md](pr-comments-summary.md)** | Running summary of completed work | **READ BEFORE EACH TASK** to understand prior context |

### For AI Agents: How to Use This File

**BEFORE starting a task:**
1. First, READ [pr-comments-summary.md](pr-comments-summary.md) to understand prior work
2. Then, check THIS file to see which task is next (first unchecked task)
3. Reference the [plan file](pr-comments-filter-hierarchy-plan.md) for implementation details

**AFTER completing a task:**
1. Check off ALL items for the completed task in THIS file
2. Update [pr-comments-summary.md](pr-comments-summary.md) with a detailed summary
3. Commit both tracking files with the code changes

---

## Status Legend

- [ ] Not started
- [x] Completed
- [~] In progress

---

## Task 1: Extend ReviewComment Type

**Branch:** `task/1-extend-review-comment-type`

- [x] Branch created from `main`
- [x] `source: 'ai' | 'host'` field added to `ReviewComment` in `src/types.ts`
- [x] `hostOutdated?: boolean` field added
- [x] `hostResolved?: boolean` field added
- [x] `parentId?: string` field added
- [x] All AI comment creation updated to include `source: 'ai'`
- [x] `src/types.test.ts` created with type tests
- [x] `npm run build` passes
- [x] `npm test` passes (186/186)
- [x] `npm run package` creates .vsix
- [x] Changes committed with proper message
- [x] `docs/pr-comments-summary.md` updated
- [x] Branch merged or ready for next task

---

## Task 2: Display Filter Setting

**Branch:** `task/2-display-filter-setting`

- [x] Branch created
- [x] `prReview.showResolvedOrOutdated` setting added to `package.json`
- [x] `getDisplayComments()` function added to `src/state.ts`
- [x] `getDisplayCommentsForFile()` function added to `src/state.ts`
- [x] Tests added to `src/state.test.ts`
- [x] `npm run build` passes
- [x] `npm test` passes (195/195)
- [x] `npm run package` creates .vsix
- [x] Changes committed with proper message
- [x] `docs/pr-comments-summary.md` updated

---

## Task 3: GitHub Provider Host Fields

**Branch:** `task/3-github-provider-host-fields`

- [x] Branch created
- [x] `GhComment` type updated with `in_reply_to_id` and `position`
- [x] ID map built for parentId resolution
- [x] `source: 'host'` set on all fetched comments
- [x] `hostOutdated` set based on `position === null`
- [x] `parentId` resolved from `in_reply_to_id`
- [x] Tests added to `src/github.test.ts`
- [x] `npm run build` passes
- [x] `npm test` passes (206/206)
- [x] `npm run package` creates .vsix
- [x] Changes committed with proper message
- [x] `docs/pr-comments-summary.md` updated

---

## Task 4: GitLab and Bitbucket Providers

**Branch:** `task/4-gitlab-bitbucket-providers`

- [x] Branch created
- [x] GitLab provider sets `source: 'host'`
- [x] GitLab provider sets `hostResolved` from `discussion.resolved`
- [x] GitLab provider sets `hostOutdated` when position is null
- [x] GitLab provider sets `parentId` for reply notes
- [x] Bitbucket provider sets `source: 'host'`
- [x] Bitbucket provider sets `parentId` from `comment.parent.id`
- [x] Tests added for both providers
- [x] `npm run build` passes
- [x] `npm test` passes (226/226)
- [x] `npm run package` creates .vsix
- [x] Changes committed with proper message
- [x] `docs/pr-comments-summary.md` updated

---

## Task 5: Tree View Hierarchy

**Branch:** `task/5-tree-view-hierarchy`

- [x] Branch created
- [x] Import `getDisplayCommentsForFile` in tree-view.ts
- [x] Only root comments shown under files
- [x] Replies shown as children of parent comments
- [x] Comments with replies have `Collapsed` state
- [x] Host-resolved/outdated show indicator when visible
- [x] Host-resolved/outdated have no click command
- [x] Tests added to `src/tree-view.test.ts`
- [x] `npm run build` passes
- [x] `npm test` passes (236/236)
- [x] `npm run package` creates .vsix
- [x] Changes committed with proper message
- [x] `docs/pr-comments-summary.md` updated

---

## Task 6: Comments Panel Threading

**Branch:** `task/6-comments-panel-threading`

- [ ] Branch created
- [ ] Import `getDisplayComments` in comments.ts
- [ ] One thread per root comment
- [ ] Replies grouped in parent's thread
- [ ] `getThreadState` fixed: Resolved only for hostResolved/hostOutdated
- [ ] Local approval does NOT cause strikethrough
- [ ] Tests added to `src/comments.test.ts`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run package` creates .vsix
- [ ] Changes committed with proper message
- [ ] `docs/pr-comments-summary.md` updated

---

## Task 7: CodeLens and Decorations

**Branch:** `task/7-codelens-decorations-filter`

- [ ] Branch created
- [ ] CodeLens uses `getDisplayCommentsForFile()`
- [ ] AI comments show "[New]" prefix
- [ ] Host comments do not show "[New]"
- [ ] Decorations use `getDisplayCommentsForFile()`
- [ ] `src/codelens.test.ts` created
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run package` creates .vsix
- [ ] Changes committed with proper message
- [ ] `docs/pr-comments-summary.md` updated

---

## Task 8: Action Guards

**Branch:** `task/8-action-guards`

- [ ] Branch created
- [ ] `goToComment` guards for hostOutdated
- [ ] `goToComment` guards for hostResolved
- [ ] `fixInChat` guards for hostOutdated/hostResolved
- [ ] `generateSuggestionForComment` guards added
- [ ] Tests added to `src/extension.test.ts`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run package` creates .vsix
- [ ] Changes committed with proper message
- [ ] `docs/pr-comments-summary.md` updated
- [ ] All tasks complete!

---

## Final Checklist

- [ ] All 8 tasks completed
- [ ] All tests passing
- [ ] Extension packaged successfully
- [ ] Manual testing completed
- [ ] Ready for release
