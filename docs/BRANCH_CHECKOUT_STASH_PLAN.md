# Branch Checkout & Stash Plan

## Problem

When reviewing a PR, comments use line numbers from the PR diff. If the user's local branch doesn't match the PR head branch, file content can differ and comments point to wrong lines (drift).

**Solution:** Checkout the PR's head branch when starting a review. If the user has uncommitted changes, stash first.

---

## Scope

- **PR flow only** – Local review flow does not change branches (user is already on the branch being reviewed).
- **Optional** – Add setting `prReview.checkoutPrBranch` (default: `true`). When `false`, skip checkout and only warn about possible line drift.

---

## Data Model

### Restore Stack (persisted in `context.globalState`)

```typescript
interface RestoreStackEntry {
  branch: string;           // Branch to restore to when undoing
  stashMessage?: string;    // Only set if we actually stashed
}

// Key: "prReview.restoreStack"
restoreStack: RestoreStackEntry[];
```

- **Stash only when needed** – If working directory is clean, just checkout. No stash, no `stashMessage`.
- **Stack order** – Newest at end. Restore by processing from last to first.

---

## Flow: Start PR Review

1. User enters PR URL, we fetch PR info (including `headBranch`).
2. Get current branch: `git branch --show-current`.
3. If already on `headBranch` → no checkout needed, proceed with review.
4. If on different branch:
   - Check for uncommitted changes: `git status --porcelain`.
   - If **clean**: `git checkout headBranch`. Push `{ branch: currentBranch }` to stack.
   - If **dirty**: Prompt user:
     - *"You have uncommitted changes. Stash and switch to PR branch for accurate line numbers?"*
     - [Stash & Switch] [Continue Anyway] [Cancel]
   - If [Stash & Switch]:
     - `git stash push -m "pr-review-assistant-<timestamp>-<currentBranch>"`
     - `git checkout headBranch`
     - Push `{ branch: currentBranch, stashMessage: "pr-review-assistant-..." }` to stack.
   - If [Continue Anyway]: Proceed without checkout (warn about line drift).
   - If [Cancel]: Abort review start.
5. Persist stack to `globalState`.
6. Proceed with normal PR load (fetch files, diff, etc.).

---

## Flow: Start New Review (while another is active)

1. User starts a second PR review (different branch) without clearing the first.
2. Current branch = previous PR's head branch.
3. Need to checkout new PR's head branch.
4. Check for uncommitted changes on current branch.
5. If **clean**: `git checkout newHeadBranch`. Push `{ branch: currentBranch }` to stack.
6. If **dirty**: Stash, checkout, push `{ branch: currentBranch, stashMessage: "..." }` to stack.
7. Persist updated stack.
8. Proceed with new review (reset state, load new PR).

---

## Flow: Clear Review

1. User clicks "Clear Review".
2. If `restoreStack` is empty → just reset in-memory state, done.
3. If stack has entries:
   - Process from **last to first**:
     - `git checkout entry.branch`
     - If `entry.stashMessage`: find stash by message, `git stash pop` (or `git stash apply` + `drop`).
   - Clear stack from `globalState`.
4. Reset in-memory review state.

### Stash lookup

```bash
# List stashes, find by message
git stash list

# Pop by ref (e.g. stash@{2})
git stash pop stash@{n}
```

Match stash message prefix `pr-review-assistant-` to find our stashes. Use `git stash list --format="%gd %s"` to get ref + message.

---

## Flow: Extension Activation (IDE reopened)

1. On activate, read `restoreStack` from `globalState`.
2. If stack is empty → nothing to do.
3. If stack has entries:
   - Show one-time prompt:
     - *"PR Review: You were reviewing a PR. Restore your previous branch(es)?"*
     - [Restore] [Dismiss]
   - If [Restore]: Same logic as Clear Review (process stack, clear state).
   - If [Dismiss]: Clear stack from `globalState` (user will fix manually).

---

## Edge Cases

| Case | Handling |
|------|----------|
| Stash pop conflicts | Show error, leave stash in place. User resolves manually. Clear stack entry on success only. |
| User already on target branch | Skip checkout, no stack entry. |
| User manually switched branches | If current branch doesn't match expected, consider stack stale—prompt to clear or validate. |
| `git checkout` fails | Show error, abort. Don't persist stack. |
| Multiple stashes with same prefix | Use full message (includes timestamp) for exact match. |

---

## Implementation Checklist

- [ ] Add `prReview.checkoutPrBranch` setting (default: true)
- [ ] Add `getRestoreStack()` / `setRestoreStack()` using `globalState`
- [ ] Add `hasUncommittedChanges()` – run `git status --porcelain`
- [ ] Add `stashAndCheckout(branch, targetBranch)` – returns stash message if stashed
- [ ] Add `restoreFromStack()` – process stack in reverse, checkout + pop
- [ ] Integrate into PR start flow (after fetching PR info, before loading files)
- [ ] Integrate into Clear Review command
- [ ] Add activation check for pending restore
- [ ] Handle "Start new review" when one is active (push to stack, then load new PR)
- [ ] Add tests for stack logic (unit tests, no git)

---

## Files to Modify

- `src/extension.ts` – PR start flow, Clear Review, activation
- `src/github.ts` or new `src/git-utils.ts` – git commands (status, stash, checkout)
- `package.json` – new setting
- `src/state.ts` – possibly persist stack (or use context.globalState directly in extension)

---

## Out of Scope (for now)

- Local review flow (no branch change)
- Conflict resolution UI (rely on git's output)
- Partial restore (e.g. restore only some entries)
