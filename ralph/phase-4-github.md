# Phase 4: GitHub Integration

Implement GitHub API integration for posting PR review comments. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Prerequisites**: Phases 1-3 complete - extension runs, UI displays findings, user can confirm/reject
- **Key files**: `src/github.ts`, `src/extension.ts`, `src/state.ts`
- **Goal**: Post approved comments to GitHub PR via `gh` CLI or Octokit

## Tasks

1. **Create GitHub module** (`src/github.ts`)

   - Export `submitReview(params: SubmitReviewParams): Promise<void>`
   - Params: `{ owner, repo, prNumber, comments: { file, line, body }[] }`
   - Use `prReview.githubAuth` setting: `"gh-cli"` or `"token"`

2. **Implement gh CLI wrapper** (when `githubAuth === "gh-cli"`)

   - Use `child_process.exec` or `child_process.execSync` with `gh api`
   - Endpoint: `POST /repos/{owner}/{repo}/pulls/{prNumber}/reviews`
   - Body: `{ body: "AI-assisted review", event: "COMMENT", comments: [...] }`
   - Ensure proper escaping of JSON for shell (use `-F` or stdin if needed)
   - Check `gh` is installed and authenticated; show clear error if not

3. **Implement Octokit alternative** (when `githubAuth === "token"`)

   - Add `prReview.githubToken` configuration (use `vscode.SecretStorage` or workspace config)
   - Use `@octokit/rest` to call `pulls.createReview`
   - Same payload: event `COMMENT`, comments array with path, line, body

4. **Wire up Submit Comments**

   - When user clicks "Submit PR Comments" in webview, webview sends `submitComments` message
   - Extension receives, gets approved findings from state
   - Map to `{ file, line, body }` where body = `editedComment` or `**${issue}**\n\n${suggestion}`
   - Call `submitReview` with repo info from state (prNumber, repoOwner, repoName)
   - Show success message via `vscode.window.showInformationMessage`
   - Show error via `vscode.window.showErrorMessage` with details

5. **Add PR/repo detection** (optional but useful)

   - If repo owner/name not set, try to detect from `git remote` or `gh pr view`
   - Fallback: prompt user for owner and repo when starting review

6. **Handle API errors**

   - Network errors, 401/403, 404, rate limits
   - Display user-friendly messages; log full error for debugging

## Completion Criteria

- [ ] `npm run build` succeeds
- [ ] With `gh-cli` auth: can post comments to a real PR (use a test repo)
- [ ] With `token` auth: same (if token configured)
- [ ] Error when `gh` not installed or not logged in shows clear message
- [ ] Success shows "Comments submitted" notification
- [ ] No unhandled promise rejections

## Verification Commands

```bash
npm run build
```

Then: F5, start review on a real PR with findings, approve some, click Submit. Verify comments appear on GitHub.

## Self-Correction Loop

1. Implement GitHub integration
2. Test with `gh` CLI first (ensure `gh auth status` works)
3. If API errors: check payload format, auth, and GitHub API docs
4. Test token auth if applicable

## Completion Signal

When all completion criteria are met, output:

```
PHASE_4_COMPLETE
```
