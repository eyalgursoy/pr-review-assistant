# PR Comments: Filtering, Hierarchy, and Source Distinction

---

## File Roles (Read This First)

This implementation uses **three coordinated files**. Each has a specific purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[pr-comments-filter-hierarchy-plan.md](pr-comments-filter-hierarchy-plan.md)** (THIS FILE) | Master plan with detailed specifications | Reference for implementation details, code snippets, and requirements |
| **[pr-comments-tasks.md](pr-comments-tasks.md)** | Task checklist with completion status | Check/update task progress, see what's done vs pending |
| **[pr-comments-summary.md](pr-comments-summary.md)** | Running summary of completed work | **READ BEFORE EACH TASK** to understand prior context |

### For AI Agents: Mandatory Workflow

**BEFORE starting ANY task:**
1. **READ** [pr-comments-summary.md](pr-comments-summary.md) completely - understand what was done before
2. **CHECK** [pr-comments-tasks.md](pr-comments-tasks.md) - verify current task status
3. **REFERENCE** this plan file for implementation details

**DURING each task:**
- Follow the code snippets and specifications in THIS file
- Run tests frequently: `npm test`

**AFTER completing each task:**
1. Run `npm run build` - must pass
2. Run `npm test` - all tests must pass  
3. Run `npm run package` - must create .vsix
4. **UPDATE** [pr-comments-tasks.md](pr-comments-tasks.md) - check off ALL items for the task
5. **UPDATE** [pr-comments-summary.md](pr-comments-summary.md) - add detailed summary including:
   - What was changed
   - Files modified
   - Key decisions made
   - Any issues encountered
6. Commit all changes (including both tracking files) following project conventions

---

## Overview

This plan implements PR comment filtering (hide resolved/outdated), reply hierarchy (nested tree), and AI vs host distinction across GitHub, GitLab, and Bitbucket providers. Split into 8 small tasks, each with its own branch, tests, and commit.

---

## Terminology (Distinct Concepts)

| Term | Meaning |
|------|---------|
| `hostResolved` | Thread marked resolved on GitHub/GitLab/Bitbucket |
| `hostOutdated` | Comment position no longer valid (code changed) |
| `status` | Local user decision: `pending`, `approved`, `rejected` |
| `source` | Origin of comment: `'ai'` or `'host'` |

**Important:** `hostResolved`/`hostOutdated` are about the state on the remote host. `status` is the local user's decision in the extension. These are independent - a comment can be `hostResolved: false` but `status: 'approved'`.

---

## Task 1: Extend ReviewComment Type with New Fields

**Branch:** `task/1-extend-review-comment-type`

**Goal:** Add foundational fields to `ReviewComment` interface.

### Changes

**File: `src/types.ts`**

Add these fields to `ReviewComment` interface:

```typescript
export interface ReviewComment {
  // ... existing fields ...

  /** Origin of comment: AI-generated or fetched from host */
  source: 'ai' | 'host';

  /** Comment position no longer valid on host (code changed) */
  hostOutdated?: boolean;

  /** Thread marked resolved on host (GitHub/GitLab/Bitbucket) */
  hostResolved?: boolean;

  /** Parent comment ID for reply hierarchy (undefined = root comment) */
  parentId?: string;
}
```

**File: `src/ai-providers.ts`** (and any other file creating AI comments)

Add `source: 'ai'` to all AI-generated comments.

### Tests

**File: `src/types.test.ts`** (new file)

```typescript
import { describe, it, expect } from 'vitest';
import type { ReviewComment } from './types';

describe('ReviewComment type', () => {
  it('should accept AI source', () => {
    const comment: ReviewComment = {
      id: 'test-1',
      file: 'test.ts',
      line: 1,
      side: 'RIGHT',
      severity: 'medium',
      issue: 'Test issue',
      status: 'pending',
      source: 'ai',
    };
    expect(comment.source).toBe('ai');
  });

  it('should accept host source with optional fields', () => {
    const comment: ReviewComment = {
      id: 'host-gh-123',
      file: 'test.ts',
      line: 1,
      side: 'RIGHT',
      severity: 'medium',
      issue: 'Test issue',
      status: 'pending',
      source: 'host',
      hostOutdated: true,
      hostResolved: false,
      parentId: 'host-gh-100',
    };
    expect(comment.source).toBe('host');
    expect(comment.hostOutdated).toBe(true);
  });
});
```

### Definition of Done

- [ ] `source` field added to ReviewComment (required, type `'ai' | 'host'`)
- [ ] `hostOutdated` field added (optional boolean)
- [ ] `hostResolved` field added (optional boolean)
- [ ] `parentId` field added (optional string)
- [ ] All existing code creating AI comments updated to include `source: 'ai'`
- [ ] `src/types.test.ts` created with type tests
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 2: Add Display Filter Setting and Helper

**Branch:** `task/2-display-filter-setting`

**Goal:** Add setting to control resolved/outdated visibility and create filter helper.

### Changes

**File: `package.json`**

Add to `contributes.configuration.properties`:

```json
"prReview.showResolvedOrOutdated": {
  "type": "string",
  "enum": ["hide", "show"],
  "default": "hide",
  "description": "How to handle host-resolved or outdated comments. 'hide' excludes them from display; 'show' includes them with visual indicator."
}
```

**File: `src/state.ts`**

Add these functions:

```typescript
import * as vscode from 'vscode';

/** Get comments filtered for display (excludes host-resolved/outdated when setting is 'hide') */
export function getDisplayComments(): ReviewComment[] {
  const setting = vscode.workspace
    .getConfiguration('prReview')
    .get<string>('showResolvedOrOutdated', 'hide');
  const all = getAllComments();
  if (setting === 'hide') {
    return all.filter(c => !c.hostResolved && !c.hostOutdated);
  }
  return all;
}

/** Get display comments for a specific file */
export function getDisplayCommentsForFile(filePath: string): ReviewComment[] {
  const setting = vscode.workspace
    .getConfiguration('prReview')
    .get<string>('showResolvedOrOutdated', 'hide');
  const comments = getCommentsForFile(filePath);
  if (setting === 'hide') {
    return comments.filter(c => !c.hostResolved && !c.hostOutdated);
  }
  return comments;
}
```

### Tests

**File: `src/state.test.ts`** (extend existing)

```typescript
describe('getDisplayComments', () => {
  beforeEach(() => {
    resetState();
    // Mock vscode.workspace.getConfiguration
  });

  it('excludes hostResolved comments when setting is hide', () => {
    addComments([
      { ...baseComment, id: '1', hostResolved: false, source: 'host' },
      { ...baseComment, id: '2', hostResolved: true, source: 'host' },
    ]);
    // Mock setting to 'hide'
    const display = getDisplayComments();
    expect(display).toHaveLength(1);
    expect(display[0].id).toBe('1');
  });

  it('excludes hostOutdated comments when setting is hide', () => {
    addComments([
      { ...baseComment, id: '1', hostOutdated: false, source: 'host' },
      { ...baseComment, id: '2', hostOutdated: true, source: 'host' },
    ]);
    const display = getDisplayComments();
    expect(display).toHaveLength(1);
  });

  it('includes all comments when setting is show', () => {
    addComments([
      { ...baseComment, id: '1', hostResolved: true, source: 'host' },
      { ...baseComment, id: '2', hostOutdated: true, source: 'host' },
    ]);
    // Mock setting to 'show'
    const display = getDisplayComments();
    expect(display).toHaveLength(2);
  });
});
```

### Definition of Done

- [ ] Setting `prReview.showResolvedOrOutdated` added to package.json
- [ ] `getDisplayComments()` function implemented
- [ ] `getDisplayCommentsForFile()` function implemented
- [ ] Unit tests pass for all filter scenarios
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 3: Update GitHub Provider with Host Fields

**Branch:** `task/3-github-provider-host-fields`

**Goal:** Map `hostOutdated`, `hostResolved`, `parentId`, and `source` from GitHub API.

### Changes

**File: `src/providers/github.ts`**

Update `fetchPRComments` function:

```typescript
async fetchPRComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewComment[]> {
  // ... existing setup ...

  type GhComment = {
    id?: number;
    node_id?: string;
    path?: string;
    line?: number | null;
    original_line?: number | null;
    side?: string;
    body?: string;
    user?: { login?: string } | null;
    subject_type?: string;
    in_reply_to_id?: number | null;  // NEW
    position?: number | null;         // NEW - null means outdated
  };

  // Build ID map for parentId resolution
  const idMap = new Map<number, string>(); // numeric id -> host-gh-nodeId

  // First pass: build ID map
  for (const item of items) {
    const nodeId = item.node_id ?? String(item.id ?? '');
    const id = `host-gh-${nodeId}`;
    if (item.id) {
      idMap.set(item.id, id);
    }
  }

  // Second pass: create comments with parentId resolved
  for (const item of items) {
    const path = item.path;
    if (!path) continue;

    const nodeId = item.node_id ?? String(item.id ?? '');
    const id = `host-gh-${nodeId}`;
    
    // Outdated: position is null (GitHub marks comments outdated this way)
    const isFileLevel = item.subject_type === 'file';
    const hostOutdated = !isFileLevel && item.position === null;

    // Parent ID for replies
    let parentId: string | undefined;
    if (item.in_reply_to_id && idMap.has(item.in_reply_to_id)) {
      parentId = idMap.get(item.in_reply_to_id);
    }

    // ... existing field mapping ...

    all.push({
      id,
      file: filePath,
      line: typeof line === 'number' ? line : 1,
      side,
      severity: 'medium',
      issue: parsedBody.issue,
      suggestion: parsedBody.suggestion,
      codeSnippet: parsedBody.codeSnippet,
      status: 'pending',
      authorName: item.user?.login,
      source: 'host',           // NEW
      hostOutdated,             // NEW
      hostResolved: false,      // REST API doesn't expose this
      parentId,                 // NEW
    });
  }

  return all;
}
```

**Note:** GitHub REST API does not expose thread resolution state. `hostResolved` will remain `false` until GraphQL support is added (out of scope).

### Tests

**File: `src/github.test.ts`** (extend existing)

```typescript
describe('fetchPRComments host fields', () => {
  it('sets hostOutdated true when position is null', () => {
    const comment = mapGitHubComment({
      id: 1,
      node_id: 'abc',
      path: 'test.ts',
      position: null,
      line: 5,
      body: 'Issue',
    });
    expect(comment.hostOutdated).toBe(true);
    expect(comment.source).toBe('host');
  });

  it('sets hostOutdated false when position is set', () => {
    const comment = mapGitHubComment({
      id: 1,
      node_id: 'abc',
      path: 'test.ts',
      position: 5,
      line: 5,
      body: 'Issue',
    });
    expect(comment.hostOutdated).toBe(false);
  });

  it('sets parentId from in_reply_to_id', () => {
    const comments = mapGitHubComments([
      { id: 1, node_id: 'parent', path: 'test.ts', position: 5, body: 'Parent' },
      { id: 2, node_id: 'child', path: 'test.ts', position: 5, body: 'Reply', in_reply_to_id: 1 },
    ]);
    expect(comments[0].parentId).toBeUndefined();
    expect(comments[1].parentId).toBe('host-gh-parent');
  });

  it('sets source to host for all comments', () => {
    const comment = mapGitHubComment({ id: 1, path: 'test.ts', body: 'Issue' });
    expect(comment.source).toBe('host');
  });
});
```

### Definition of Done

- [ ] `source: 'host'` set on all fetched comments
- [ ] `hostOutdated` set based on `position === null`
- [ ] `hostResolved` set to `false` (REST API limitation documented)
- [ ] `parentId` resolved from `in_reply_to_id` using ID map
- [ ] Two-pass approach: build ID map first, then resolve parentId
- [ ] Unit tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 4: Update GitLab and Bitbucket Providers

**Branch:** `task/4-gitlab-bitbucket-providers`

**Goal:** Add host fields to GitLab and Bitbucket providers.

### Changes

**File: `src/providers/gitlab.ts`**

```typescript
// GitLab discussions API returns:
// - discussion.notes[0] = root, subsequent = replies
// - discussion.resolved (boolean) for resolution state
// - note.position = null for outdated

for (const discussion of discussions) {
  const rootNote = discussion.notes[0];
  const rootId = `host-gl-${rootNote.id}`;

  for (let i = 0; i < discussion.notes.length; i++) {
    const note = discussion.notes[i];
    const noteId = `host-gl-${note.id}`;
    
    all.push({
      id: noteId,
      file: note.position?.new_path ?? note.position?.old_path ?? '',
      line: note.position?.new_line ?? note.position?.old_line ?? 1,
      // ... other fields ...
      source: 'host',
      hostOutdated: note.position === null,
      hostResolved: discussion.resolved ?? false,
      parentId: i > 0 ? rootId : undefined,
    });
  }
}
```

**File: `src/providers/bitbucket.ts`**

```typescript
// Bitbucket comments API:
// - comment.parent.id for replies
// - comment.deleted for outdated (approximate)

all.push({
  id: `host-bb-${comment.id}`,
  // ... other fields ...
  source: 'host',
  hostOutdated: comment.deleted ?? false,
  hostResolved: false, // Bitbucket doesn't have thread resolution
  parentId: comment.parent?.id ? `host-bb-${comment.parent.id}` : undefined,
});
```

### Tests

Create/extend test files for GitLab and Bitbucket providers with similar tests to GitHub.

### Definition of Done

- [ ] GitLab provider sets `source: 'host'` on all comments
- [ ] GitLab provider sets `hostResolved` from `discussion.resolved`
- [ ] GitLab provider sets `hostOutdated` when position is null
- [ ] GitLab provider sets `parentId` for non-first notes in discussion
- [ ] Bitbucket provider sets `source: 'host'` on all comments
- [ ] Bitbucket provider sets `parentId` from `comment.parent.id`
- [ ] Unit tests pass for both providers
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 5: Update Tree View with Filtering and Hierarchy

**Branch:** `task/5-tree-view-hierarchy`

**Goal:** Tree shows only root comments under files, replies as children, filtered by setting.

### Changes

**File: `src/tree-view.ts`**

```typescript
import { getDisplayCommentsForFile } from './state';

// In getChildren(element):
if (element.type === 'file' && element.file) {
  const comments = getDisplayCommentsForFile(element.file.path);
  // Only root comments (no parentId)
  const roots = comments.filter(c => !c.parentId);
  return roots.map((comment) => ({
    type: 'comment' as TreeItemType,
    label: this.truncate(comment.issue, 50),
    comment,
  }));
}

// NEW: Children of comment = replies
if (element.type === 'comment' && element.comment) {
  const allComments = getDisplayCommentsForFile(element.comment.file);
  const replies = allComments.filter(c => c.parentId === element.comment!.id);
  return replies.map((reply) => ({
    type: 'comment' as TreeItemType,
    label: this.truncate(reply.issue, 50),
    description: '(reply)',
    comment: reply,
  }));
}

// In getTreeItem for comment:
case 'comment':
  const comment = element.comment!;
  const allFileComments = getDisplayCommentsForFile(comment.file);
  const hasReplies = allFileComments.some(c => c.parentId === comment.id);
  
  item.collapsibleState = hasReplies
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;

  // Visual indicator for host-resolved/outdated
  if (comment.hostOutdated || comment.hostResolved) {
    item.description = comment.hostOutdated ? '(outdated)' : '(resolved)';
    item.command = undefined; // Non-actionable
  } else {
    item.command = {
      command: 'prReview.goToComment',
      title: 'Go to Comment',
      arguments: [comment],
    };
  }
  break;
```

### Tests

**File: `src/tree-view.test.ts`** (extend existing)

```typescript
describe('tree view hierarchy', () => {
  it('shows only root comments under file', () => {
    // Setup state with root and reply comments
    const children = provider.getChildren(fileElement);
    expect(children.filter(c => c.type === 'comment')).toHaveLength(1); // Only root
  });

  it('shows replies under parent comment', () => {
    const replies = provider.getChildren(rootCommentElement);
    expect(replies).toHaveLength(2); // Two replies
    expect(replies[0].description).toBe('(reply)');
  });

  it('excludes hostResolved comments when setting is hide', () => {
    // Mock setting to 'hide', add hostResolved comment
    const children = provider.getChildren(fileElement);
    expect(children.find(c => c.comment?.hostResolved)).toBeUndefined();
  });

  it('shows hostResolved with indicator when setting is show', () => {
    // Mock setting to 'show'
    const item = provider.getTreeItem(hostResolvedElement);
    expect(item.description).toBe('(resolved)');
    expect(item.command).toBeUndefined();
  });

  it('sets Collapsed state for comments with replies', () => {
    const item = provider.getTreeItem(commentWithRepliesElement);
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
  });
});
```

### Definition of Done

- [ ] Only root comments (no `parentId`) shown under files
- [ ] Replies shown as children of parent comments
- [ ] Comments with replies have `Collapsed` state
- [ ] Filtering applied based on `showResolvedOrOutdated` setting
- [ ] Host-resolved/outdated comments show indicator when visible
- [ ] Host-resolved/outdated comments have no click command
- [ ] Unit tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 6: Update Comments Panel with Filtering and Threading

**Branch:** `task/6-comments-panel-threading`

**Goal:** One thread per root comment, replies in same thread, filtered by setting.

### Changes

**File: `src/comments.ts`**

```typescript
import { getDisplayComments } from './state';

function refreshCommentThreads(): void {
  if (!commentController) return;

  const displayComments = getDisplayComments();
  const updatedThreadIds = new Set<string>();

  // Group by root: only create threads for root comments
  const rootComments = displayComments.filter(c => !c.parentId);

  for (const root of rootComments) {
    const threadId = root.id;
    updatedThreadIds.add(threadId);

    let thread = threadMap.get(threadId);
    if (!thread) {
      const uri = getFileUri(root.file);
      const line = Math.max(0, root.line - 1);
      const range = new vscode.Range(line, 0, line, 0);
      thread = commentController.createCommentThread(uri, range, []);
      thread.canReply = false;
      threadMap.set(threadId, thread);
    }

    // Find replies to this root
    const replies = displayComments.filter(c => c.parentId === root.id);

    // Build comments array: root first, then replies
    const threadComments = [root, ...replies].map(c =>
      new PRReviewComment(
        formatCommentBody(c),
        vscode.CommentMode.Preview,
        getAuthorInfo(c),
        c,
        thread
      )
    );

    thread.comments = threadComments;
    thread.label = getSeverityLabel(root.severity);
    thread.state = getThreadState(root);
    thread.contextValue = `prReviewThread-${root.status}`;
    thread.collapsibleState = root.status === 'pending'
      ? vscode.CommentThreadCollapsibleState.Expanded
      : vscode.CommentThreadCollapsibleState.Collapsed;
  }

  // Remove threads that no longer exist
  for (const [threadId, thread] of threadMap) {
    if (!updatedThreadIds.has(threadId)) {
      thread.dispose();
      threadMap.delete(threadId);
    }
  }
}

// FIX: Strikethrough only for host-resolved/outdated
function getThreadState(comment: ReviewComment): vscode.CommentThreadState {
  // Only host-resolved/outdated should show as Resolved (strikethrough)
  if (comment.hostResolved || comment.hostOutdated) {
    return vscode.CommentThreadState.Resolved;
  }
  // Local status (approved/rejected) does NOT cause strikethrough
  return vscode.CommentThreadState.Unresolved;
}
```

### Tests

**File: `src/comments.test.ts`** (extend existing)

```typescript
describe('comment threading', () => {
  it('creates one thread per root comment', () => {
    // Add root + 2 replies
    refreshCommentThreads();
    expect(threadMap.size).toBe(1); // Only one thread
  });

  it('includes replies in parent thread', () => {
    // Add root + 2 replies
    refreshCommentThreads();
    const thread = threadMap.get(rootId);
    expect(thread?.comments).toHaveLength(3); // root + 2 replies
  });

  it('sets Resolved state only for hostResolved comments', () => {
    const state = getThreadState({ ...baseComment, hostResolved: true });
    expect(state).toBe(vscode.CommentThreadState.Resolved);
  });

  it('sets Unresolved state for locally approved comments', () => {
    const state = getThreadState({ ...baseComment, status: 'approved', hostResolved: false });
    expect(state).toBe(vscode.CommentThreadState.Unresolved);
  });
});
```

### Definition of Done

- [ ] One thread created per root comment (not per reply)
- [ ] Replies grouped in parent's thread comments array
- [ ] `getThreadState` returns `Resolved` ONLY for `hostResolved` or `hostOutdated`
- [ ] Local approval/rejection does NOT cause strikethrough
- [ ] Filtering applied based on setting
- [ ] Unit tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 7: Update CodeLens and Decorations with Filtering

**Branch:** `task/7-codelens-decorations-filter`

**Goal:** CodeLens and decorations use filtered comments, show "[New]" for AI comments.

### Changes

**File: `src/codelens.ts`**

```typescript
import { getDisplayCommentsForFile } from './state';

provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
  const filePath = this.getRelativePath(document.uri);
  const comments = getDisplayCommentsForFile(filePath); // Use filtered

  if (comments.length === 0) {
    return [];
  }

  const codeLenses: vscode.CodeLens[] = [];

  for (const comment of comments) {
    const line = Math.min(Math.max(0, comment.line - 1), document.lineCount - 1);
    const range = new vscode.Range(line, 0, line, 0);

    const severityEmoji = this.getSeverityEmoji(comment.severity);
    const statusIcon = this.getStatusIcon(comment.status);
    const shortIssue = this.truncate(comment.issue, 80);
    
    // NEW: Show "[New]" for AI comments
    const sourceIndicator = comment.source === 'ai' ? '[New] ' : '';

    codeLenses.push(
      new vscode.CodeLens(range, {
        title: `${statusIcon} ${severityEmoji} ${sourceIndicator}${shortIssue}`,
        command: 'prReview.goToComment',
        arguments: [comment],
        tooltip: `Click to view comment details\n\n${comment.issue}`,
      })
    );
  }

  return codeLenses;
}

// Also update updateDecorations to use getDisplayCommentsForFile
export function updateDecorations(
  editor: vscode.TextEditor,
  decorations: ReturnType<typeof createCommentDecorations>
): void {
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
  const comments = getDisplayCommentsForFile(filePath); // Use filtered
  // ... rest unchanged ...
}
```

### Tests

**File: `src/codelens.test.ts`** (new file)

```typescript
import { describe, it, expect } from 'vitest';

describe('CodeLens provider', () => {
  it('shows [New] prefix for AI comments', () => {
    const title = buildCodeLensTitle({ ...baseComment, source: 'ai' });
    expect(title).toContain('[New]');
  });

  it('does not show [New] for host comments', () => {
    const title = buildCodeLensTitle({ ...baseComment, source: 'host' });
    expect(title).not.toContain('[New]');
  });

  it('excludes hostResolved comments when setting is hide', () => {
    // Mock setting to 'hide'
    const lenses = provider.provideCodeLenses(document);
    expect(lenses.find(l => l.command?.arguments?.[0]?.hostResolved)).toBeUndefined();
  });
});
```

### Definition of Done

- [ ] CodeLens uses `getDisplayCommentsForFile()` for filtering
- [ ] AI comments show "[New]" prefix in CodeLens
- [ ] Host comments do not show "[New]"
- [ ] Decorations use `getDisplayCommentsForFile()` for filtering
- [ ] Unit tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task 8: Add Guards for Host-Resolved/Outdated Actions

**Branch:** `task/8-action-guards`

**Goal:** Prevent errors when clicking on host-resolved/outdated comments.

### Changes

**File: `src/extension.ts`**

```typescript
async function goToComment(comment: ReviewComment) {
  // Guard for host-resolved/outdated
  if (comment.hostOutdated) {
    vscode.window.showInformationMessage(
      'This comment is outdated - the code has changed since it was posted.'
    );
    return;
  }
  if (comment.hostResolved) {
    vscode.window.showInformationMessage(
      'This comment thread was resolved on the host.'
    );
    return;
  }
  
  // ... existing logic ...
}

async function fixInChat(comment: ReviewComment) {
  if (comment.hostOutdated) {
    vscode.window.showInformationMessage(
      'Cannot fix in chat - this comment is outdated and the code has changed.'
    );
    return;
  }
  if (comment.hostResolved) {
    vscode.window.showInformationMessage(
      'This comment was already resolved on the host.'
    );
    return;
  }
  
  // ... existing logic ...
}

async function generateSuggestionForComment(comment: ReviewComment) {
  if (comment.hostOutdated) {
    vscode.window.showInformationMessage(
      'Cannot generate suggestion - this comment is outdated and the code has changed.'
    );
    return;
  }
  if (comment.hostResolved) {
    vscode.window.showInformationMessage(
      'This comment was already resolved on the host.'
    );
    return;
  }
  
  // ... existing logic ...
}
```

### Tests

**File: `src/extension.test.ts`** (new file or extend)

```typescript
describe('action guards', () => {
  it('goToComment shows message for hostOutdated', async () => {
    const showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
    await goToComment({ ...baseComment, hostOutdated: true });
    expect(showInfoSpy).toHaveBeenCalledWith(expect.stringContaining('outdated'));
  });

  it('goToComment shows message for hostResolved', async () => {
    const showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
    await goToComment({ ...baseComment, hostResolved: true });
    expect(showInfoSpy).toHaveBeenCalledWith(expect.stringContaining('resolved'));
  });

  it('fixInChat shows message for hostOutdated', async () => {
    const showInfoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
    await fixInChat({ ...baseComment, hostOutdated: true });
    expect(showInfoSpy).toHaveBeenCalledWith(expect.stringContaining('outdated'));
  });

  it('goToComment proceeds for normal comments', async () => {
    const openDocSpy = vi.spyOn(vscode.workspace, 'openTextDocument');
    await goToComment({ ...baseComment, hostOutdated: false, hostResolved: false });
    expect(openDocSpy).toHaveBeenCalled();
  });
});
```

### Definition of Done

- [ ] `goToComment` shows info message and returns early for `hostOutdated`
- [ ] `goToComment` shows info message and returns early for `hostResolved`
- [ ] `fixInChat` shows info message and returns early for `hostOutdated`
- [ ] `fixInChat` shows info message and returns early for `hostResolved`
- [ ] `generateSuggestionForComment` has same guards
- [ ] Normal comments proceed without interruption
- [ ] Unit tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Committed and packaged

---

## Task Execution Order

```
Task 1 (Types) → Task 2 (Filter Setting) → Task 3 (GitHub) → Task 4 (GitLab/Bitbucket)
                                                                      ↓
Task 8 (Guards) ← Task 7 (CodeLens) ← Task 6 (Comments Panel) ← Task 5 (Tree View)
```

---

## Error Handling Summary

| Scenario | Handling |
|----------|----------|
| File doesn't exist | Show warning, skip navigation |
| Line out of bounds | Clamp to valid range |
| Host API returns unexpected data | Log warning, skip field, use defaults |
| `hostOutdated` comment clicked | Show info message, don't navigate |
| `hostResolved` comment clicked | Show info message, don't navigate |
| Reply without valid parent in ID map | Treat as root comment (`parentId` undefined) |

---

## UI Changes Summary

| Component | Before | After |
|-----------|--------|-------|
| Tree: Comments under file | All comments flat | Only roots; replies nested under parent |
| Tree: Host-resolved | Shown normally | Hidden (default) or "(resolved)" indicator |
| Tree: Click on outdated | May error | Shows info message, no action |
| Comments Panel: Threads | One per comment | One per root, replies grouped |
| Comments Panel: Approved | Strikethrough | No strikethrough (just collapsed) |
| Comments Panel: Host-resolved | Shown normally | Strikethrough |
| CodeLens: AI comment | No indicator | "[New]" prefix |
| CodeLens: Host-resolved | Shown | Hidden (default) or shown with filter |
