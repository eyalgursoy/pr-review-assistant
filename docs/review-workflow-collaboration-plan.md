# Review Workflow & Collaboration

---

## File Roles (Read This First)

This implementation uses **three coordinated files**. Each has a specific purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[review-workflow-collaboration-plan.md](review-workflow-collaboration-plan.md)** (THIS FILE) | Master plan with detailed specifications | Reference for implementation details, code snippets, and requirements |
| **[review-workflow-collaboration-tasks.md](review-workflow-collaboration-tasks.md)** | Task checklist with completion status | Check/update task progress, see what's done vs pending |
| **[review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md)** | Running summary of completed work | **READ BEFORE EACH TASK** to understand prior context |

### For AI Agents: Mandatory Workflow

**BEFORE starting ANY task:**
1. **READ** [review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md) completely — understand what was done before.
2. **CHECK** [review-workflow-collaboration-tasks.md](review-workflow-collaboration-tasks.md) — verify current task status.
3. **REFERENCE** this plan file for implementation details.

**DURING each task:**
- Follow the code snippets and specifications in THIS file.
- Run tests frequently: `npm test`.

**AFTER completing each task:**
1. Run `npm run build` — must pass.
2. Run `npm test` — all tests must pass.
3. Run `npm run package` — must create .vsix.
4. **UPDATE** [review-workflow-collaboration-tasks.md](review-workflow-collaboration-tasks.md) — check off ALL items for the task.
5. **UPDATE** [review-workflow-collaboration-summary.md](review-workflow-collaboration-summary.md) — add detailed summary.
6. Commit all changes (including both tracking files) following project conventions.

---

## Overview

Implement two collaboration features:

1. **Reply to host comments** — A "Reply" action that posts a reply to an existing GitHub/GitLab/Bitbucket thread using existing provider APIs. Lets users respond to reviewer feedback without leaving the IDE.
2. **Resolve / Unresolve on host** — Buttons to mark a thread as resolved (or unresolved) on the host, synced with `hostResolved`. Keeps host and IDE in sync; fewer context switches.

Existing types already have `hostResolved`, `parentId`, and `source`. We need to add provider-specific IDs for reply and resolve APIs, then add provider methods and UI.

---

## Terminology

| Term | Meaning |
|------|---------|
| `hostCommentId` | Host’s native comment ID (e.g. GitHub REST numeric id for reply endpoint). |
| `hostThreadId` | Host’s thread/discussion ID (e.g. GitHub `PRRT_xxx`, GitLab discussion id). Used for resolve/unresolve and for GitLab reply. |
| `hostResolved` | Already exists: thread marked resolved on host. |

---

## Task 1: Extend Data Model and Fetch for Reply/Resolve

**Branch:** `task/1-host-ids-and-thread-resolution`

**Goal:** Add `hostCommentId` and `hostThreadId` to `ReviewComment`; extend providers’ fetch (and GitHub GraphQL) so every host comment has the IDs needed for reply and resolve.

### 1.1 Types

**File: `src/types.ts`**

Add to `ReviewComment`:

```typescript
/** Host's native comment ID (e.g. GitHub REST id for reply API). Optional. */
hostCommentId?: number | string;

/** Host's thread/discussion ID (e.g. GitHub PRRT_xxx, GitLab discussion id). Optional. */
hostThreadId?: string;
```

### 1.2 GitHub

- **REST:** When mapping `GhComment` → `ReviewComment`, set `hostCommentId: item.id` (numeric) so the reply API can use it.
- **GraphQL:** Extend `REVIEW_THREADS_QUERY` in `src/providers/github-graphql.ts` to include thread `id` in each node:

```graphql
nodes {
  id
  isResolved
  isOutdated
  comments(first: 50) { nodes { id } }
}
```

- Build a map `comment node_id → thread id` and in `applyGraphQLResolution` (or a small helper) set `hostThreadId` on each comment from that map.
- Ensure `fetchReviewThreadsResolution` returns or the apply step receives both resolution state and thread id per comment.

### 1.3 GitLab

- **File: `src/providers/gitlab.ts`**
- Add `id?: string` to `GlDiscussion` (GitLab API returns discussion id).
- In `mapGitLabDiscussions`, set on each comment: `hostThreadId: discussion.id`, and optionally `hostCommentId: note.id` for consistency (reply will use discussion id to add a note).

### 1.4 Bitbucket

- Bitbucket has no thread resolution; leave `hostThreadId` unset.
- Reply uses parent comment id; we already have `parentId` as `host-bb-<id>`. We can parse numeric id from `comment.id` (`host-bb-123` → 123) when implementing reply. No type change required for fetch; optional `hostCommentId` can be set from parsed id if useful.

### Tests

- Extend `src/types.test.ts` (or provider tests) to assert new optional fields.
- Ensure existing provider tests still pass and, where relevant, assert `hostCommentId` / `hostThreadId` when present.

---

## Task 2: Provider APIs for Reply and Resolve

**Branch:** `task/2-provider-reply-resolve-apis`

**Goal:** Add optional `replyToComment` and `setThreadResolved` to `PRProvider`; implement for GitHub, GitLab, and Bitbucket (resolve no-op for Bitbucket).

### 2.1 Provider interface

**File: `src/providers/types.ts`**

```typescript
/** Reply to an existing host comment/thread (optional). */
replyToComment?(
  pr: PRInfo,
  comment: ReviewComment,
  body: string
): Promise<SubmitResult>;

/** Mark a thread as resolved or unresolved on the host (optional). */
setThreadResolved?(
  pr: PRInfo,
  threadId: string,
  resolved: boolean
): Promise<SubmitResult>;
```

### 2.2 GitHub

- **Reply:** REST `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` with body `{ body }` and `in_reply_to` (numeric comment id). Use `comment.hostCommentId` (numeric). If the endpoint expects a different path (e.g. `.../comments/{comment_id}/replies`), use that; ensure `hostCommentId` is the right id for the chosen endpoint.
- **Resolve/Unresolve:** GraphQL mutations `resolveReviewThread` and `unresolveReviewThread` with `input: { threadId }`. Use `gh api graphql` with the mutation; `threadId` is `comment.hostThreadId` (PRRT_xxx).

### 2.3 GitLab

- **Reply:** POST to create a note in a discussion: `POST /projects/:id/merge_requests/:merge_request_iid/discussions/:discussion_id/notes` with `{ body }`. Use `comment.hostThreadId` as `discussion_id`.
- **Resolve:** `PUT /projects/:id/merge_requests/:merge_request_iid/discussions/:discussion_id` with `{ resolved: true }` or `{ resolved: false }`. Use `comment.hostThreadId` as `discussion_id`.

### 2.4 Bitbucket

- **Reply:** `POST /repositories/{workspace}/{repo}/pullrequests/{id}/comments` with `content: { raw: body }` and `parent: { id: parentCommentId }`. Resolve parent from `comment.parentId` (parse numeric from `host-bb-123`) or comment’s own id for root (reply still needs a parent; only allow reply when there is a thread).
- **Resolve:** No-op; Bitbucket has no thread resolution. `setThreadResolved` can be unimplemented or return success with message "Not supported for Bitbucket."

### Tests

- Unit/mock tests for each provider’s reply and resolve (and Bitbucket no-op) where feasible.

---

## Task 3: Reply UI

**Branch:** `task/3-reply-ui`

**Goal:** Add a "Reply" action that prompts for reply text and calls the provider’s `replyToComment`; then refresh host comments or show success.

### Changes

- Register command `prReview.replyToComment` (e.g. in `extension.ts` or `comments.ts`). Accept argument: comment or `{ comment?: ReviewComment }` (same pattern as `prReview.approveComment`).
- Only enable for `source === 'host'` and when provider has `replyToComment`. For host comments without `hostThreadId`/`hostCommentId` (e.g. old data), show a short message that reply isn’t available.
- On run: prompt for reply body (e.g. `vscode.window.showInputBox` or quick pick); if empty, abort. Get current PR from state; call `provider.replyToComment(pr, comment, body)`; on success, refresh host comments (re-fetch and merge or replace) and show information message; on failure, show error.
- Expose "Reply" in:
  - Comment thread actions (e.g. in `comments.ts` contribution where approve/reject are).
  - Tree view context menu or actions for a host comment.
  - CodeLens/tree item for a host comment so it’s discoverable.

### Definition of Done

- Reply only for host comments when provider supports it.
- After successful reply, host comments are refreshed so the new reply appears (or clear message that user can reload).

---

## Task 4: Resolve / Unresolve UI

**Branch:** `task/4-resolve-unresolve-ui`

**Goal:** Add "Resolve" and "Unresolve" actions that call the provider’s `setThreadResolved` and update local state (e.g. set `hostResolved` on all comments in that thread) or re-fetch comments.

### Changes

- Register commands `prReview.resolveThread` and `prReview.unresolveThread`. Accept argument: comment or `{ comment?: ReviewComment }`. Resolve `threadId` from `comment.hostThreadId`.
- Only enable for `source === 'host'` when `comment.hostThreadId` is set and provider has `setThreadResolved`. For Bitbucket, do not show resolve/unresolve (or show disabled with tooltip).
- On run: call `provider.setThreadResolved(pr, threadId, true)` or `false`; on success, either:
  - Re-fetch PR comments and replace host comments in state, or
  - Update local state: set `hostResolved` on every comment with the same `hostThreadId` (quick feedback).
- Expose in:
  - Comment thread actions (Resolve / Unresolve depending on current `hostResolved`).
  - Tree view and CodeLens for host comments with `hostThreadId`.

### Definition of Done

- Resolve/Unresolve only for host comments that have `hostThreadId` and provider supports it.
- After success, UI reflects resolved state (either via re-fetch or local update); `hostResolved` stays in sync with host.

---

## Key Files Reference

- `src/types.ts` — `ReviewComment`, new optional fields.
- `src/providers/types.ts` — `PRProvider` optional methods.
- `src/providers/github.ts` — fetch `hostCommentId`; implement reply (REST) and resolve (GraphQL or delegate to helper).
- `src/providers/github-graphql.ts` — thread `id` in query; map comment → thread id; mutations for resolve/unresolve.
- `src/providers/gitlab.ts` — `GlDiscussion.id`, `hostThreadId`/`hostCommentId` in map; reply (notes API); resolve (PUT discussion).
- `src/providers/bitbucket.ts` — reply (parent id); resolve no-op.
- `src/extension.ts` — commands for reply, resolve, unresolve; get PR and provider.
- `src/comments.ts` — comment thread UI actions (Reply, Resolve, Unresolve).
- `src/state.ts` — replace or merge host comments after reply/resolve if re-fetching.
