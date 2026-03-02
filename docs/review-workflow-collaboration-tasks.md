# Review Workflow & Collaboration — Tasks

---

## File Roles (Read This First)

This implementation uses **three coordinated files**. Each has a specific purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[review-workflow-collaboration-plan.md](review-workflow-collaboration-plan.md)** | Master plan with detailed specifications | Reference for implementation details, code snippets, and requirements |
| **[review-workflow-collaboration-tasks.md](review-workflow-collaboration-tasks.md)** (THIS FILE) | Task checklist with completion status | Check/update task progress, see what's done vs pending |
| **[review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md)** | Running summary of completed work | **READ BEFORE EACH TASK** to understand prior context |

### For AI Agents: How to Use This File

**BEFORE starting a task:**
1. First, READ [review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md) to understand prior work
2. Then, check THIS file to see which task is next (first unchecked task)
3. Reference the [plan file](review-workflow-collaboration-plan.md) for implementation details
4. Create a new branch for the task (e.g. `task/1-host-ids-and-thread-resolution`)

**AFTER completing a task:**
1. Check off ALL items for the completed task in THIS file
2. Update [review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md) with a detailed summary
3. Follow version rules (bump version, README, CHANGELOG) before committing
4. Commit both tracking files with the code changes

---

## Status Legend

- [ ] Not started
- [x] Completed
- [~] In progress

---

## Task 1: Extend Data Model and Fetch for Reply/Resolve

**Branch:** `task/1-host-ids-and-thread-resolution`

- [x] Branch created
- [x] `hostCommentId` and `hostThreadId` added to `ReviewComment` in `src/types.ts`
- [x] GitHub: `hostCommentId` set from REST `item.id` in `mapSingleGhComment`
- [x] GitHub GraphQL: thread `id` added to query; comment → threadId map built; `hostThreadId` set in apply step
- [x] GitLab: `id` added to `GlDiscussion`; `hostThreadId` (and optional `hostCommentId`) set in `mapGitLabDiscussions`
- [x] Bitbucket: no change or optional `hostCommentId` from parsed id
- [x] Tests updated/added for new fields
- [x] `npm run build` passes
- [x] `npm test` passes
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Summary updated, changes committed

---

## Task 2: Provider APIs for Reply and Resolve

**Branch:** `task/2-provider-reply-resolve-apis`

- [x] Branch created
- [x] `replyToComment?` and `setThreadResolved?` added to `PRProvider` in `src/providers/types.ts`
- [x] GitHub: `replyToComment` (REST) and `setThreadResolved` (GraphQL mutations) implemented
- [x] GitLab: `replyToComment` (discussion notes) and `setThreadResolved` (PUT discussion) implemented
- [x] Bitbucket: `replyToComment` (parent id) implemented; `setThreadResolved` no-op or omitted
- [x] Tests added/updated for provider methods
- [x] `npm run build` passes
- [x] `npm test` passes
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Summary updated, changes committed

---

## Task 3: Reply UI

**Branch:** `task/3-reply-ui`

- [x] Branch created
- [x] Command `prReview.replyToComment` registered; accepts comment or `{ comment?: ReviewComment }`
- [x] Reply only for `source === 'host'` when provider has `replyToComment`; show message when unavailable
- [x] Input prompt for reply body; call provider; on success refresh host comments and show message
- [x] Reply action added to comment thread UI (`comments.ts`)
- [x] Reply exposed in tree view and/or CodeLens for host comments
- [x] `npm run build` passes
- [x] `npm test` passes
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Summary updated, changes committed

---

## Task 4: Resolve / Unresolve UI

**Branch:** `task/4-resolve-unresolve-ui`

- [x] Branch created
- [x] Commands `prReview.resolveThread` and `prReview.unresolveThread` registered
- [x] Only for host comments with `hostThreadId` and provider `setThreadResolved`; Bitbucket excluded
- [x] On success: re-fetch host comments or update `hostResolved` for same `hostThreadId`
- [x] Resolve/Unresolve actions added to comment thread UI
- [x] Resolve/Unresolve exposed in tree view and/or CodeLens for host comments
- [x] `npm run build` passes
- [x] `npm test` passes
- [x] `npm run package` creates .vsix
- [x] Version bumped, README/CHANGELOG updated
- [x] Summary updated, changes committed

---

## Final Checklist

- [ ] All 4 tasks completed
- [ ] All tests passing
- [ ] Extension packaged successfully
- [ ] Manual testing completed
- [ ] Ready for release
