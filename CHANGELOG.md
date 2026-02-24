# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.18.3] - 2026-02-24

### Fixed

- When Cursor CLI model is set to Auto, the extension now passes `--model Auto` explicitly to the agent instead of omitting the model parameter.

## [0.18.2] - 2026-02-22

### Security

- Add npm overrides to fix minimatch ReDoS (GHSA-3ppc-4f35-3m26) in ESLint and @typescript-eslint dependency trees. @vscode/vsce remains on vulnerable minimatch (dev-only; packaging still works) until upstream fix.
- Upgrade ESLint to 10.0.2 (fixes remaining minimatch in eslint tree). Add direct `globals` devDependency for flat config. Remove eslint from overrides (no longer needed).
- Bump @typescript-eslint/eslint-plugin and @typescript-eslint/parser to ^8.56.1 (align with ESLint 10).

### Changed

- CONTRIBUTING: document minimatch override and vsce audit findings; note on vsce package secretlint error in some environments.

### Added

- GitHub PR comments now use GraphQL to fetch thread resolution and outdated state. Resolved and outdated threads are marked correctly so they can be hidden when **Show resolved/outdated** is set to "hide" (default).

### Fixed

- When the AI returns a non-JSON response (e.g. provider error), the UI now shows the actual error message instead of a generic "Could not find JSON object" message. Redundant prefix text and Cursor's "S:" type prefix are stripped for a cleaner toast.

## [0.17.11] - 2026-02

### Added

- Comment approval and rejection status (approved/rejected/pending) are now persisted per PR in workspace state. When you reload the same PR, your previous decisions are restored so you don't have to re-approve or re-reject comments.

## [0.17.10] - 2026-02

### Changed

- Re-running AI review on the same PR now clears previous AI comments first, so the view shows only the latest AI results alongside existing host (PR) comments.

## [0.17.9] - 2026-02

### Changed

- AI review no longer adds duplicate comments: findings that target the same file and line (within ±1 line) as an existing comment are filtered out before being added. When all AI findings are duplicates, a message explains that no new issues were found.

## [0.17.8] - 2026-02

### Changed

- AI review prompt now includes existing host (PR) comments so the AI avoids repeating already-filed issues and focuses on new ones when you re-run review on the same PR.

## [0.17.7] - 2026-02

### Changed

- Clicking on an outdated host comment (code has changed since it was posted) now shows an informational message instead of attempting to navigate to a potentially invalid line.
- Clicking on a host-resolved comment now shows an informational message explaining the thread was resolved on the host. This applies to "Go to Comment", "Fix in Chat", and "Generate Suggestion".

## [0.17.6] - 2026-02

### Added

- CodeLens now shows a `[New]` prefix for AI-generated review comments, making it easy to distinguish them from host PR comments at a glance.

### Changed

- CodeLens and editor line decorations now respect the `prReview.showResolvedOrOutdated` setting — host-resolved and outdated comments are hidden from inline indicators when the setting is `"hide"` (default).

## [0.17.5] - 2026-02

### Fixed

- Comment threads in the editor no longer show strikethrough when a comment is locally approved or rejected. Strikethrough (Resolved state) now only applies to comments that are resolved or outdated on the host (GitHub/GitLab/Bitbucket).

### Changed

- One comment thread is now created per root comment; replies from host PR discussions are grouped inside the same thread instead of appearing as separate threads.
- Comment threads now respect the `prReview.showResolvedOrOutdated` setting — hidden comments no longer generate threads in the editor.

## [0.17.4] - 2026-02

### Added

- New setting `prReview.showResolvedOrOutdated` (`hide`/`show`) to control visibility of host-resolved and outdated PR comments. Default `hide` filters them from the tree view, comments panel, and CodeLens.
- Internal: `getDisplayComments()` and `getDisplayCommentsForFile()` filter helpers in state module for upcoming UI integration.

## [0.17.3] - 2026-02

### Fixed

- Cursor CLI workspace trust: when the CLI returns the "Workspace Trust Required" prompt instead of JSON, show a clear error explaining that IDE Trusted folders don't apply and how to approve the directory via `agent chat` in a terminal.

### Changed

- Internal: extended `ReviewComment` type with `source` (`'ai' | 'host'`), `hostOutdated`, `hostResolved`, and `parentId` fields as the foundational data model for upcoming comment filtering and reply hierarchy features. No user-visible changes.

## [0.17.1] - 2026-02

### Fixed

- GitHub PR comments fetch: use query string for pagination instead of request body so the list endpoint no longer returns 422.

### Changed

- Reduced debug logging for PR comments load; failure still logged and user notified.

## [0.17.0] - 2026-02

### Added

- **Load existing PR comments**: When loading a PR, the extension fetches inline review comments from the host (GitHub, GitLab, Bitbucket) and displays them in the IDE (Comments panel, tree view, CodeLens). You can use Fix in Chat and other comment actions on reviewer feedback.

## [0.16.1] - 2025-02

### Fixed

- "View online" button after submitting review now opens the PR/MR page (was checking for "View on GitHub" so the link never opened).

## [0.16.0] - 2025-02

### Added

- **GitLab Merge Request support**: Paste a GitLab MR URL to load, run AI review, and submit comments. Auth via Personal/Project Access Token (stored with **Set API Key (Secure)** → GitLab). Settings: `prReview.gitlabUrl` (default `https://gitlab.com`), `prReview.gitlabToken` (deprecated).
- **Bitbucket Pull Request support**: Paste a Bitbucket PR URL to load, run AI review, and submit comments. Auth via App Password or token (stored with **Set API Key (Secure)** → Bitbucket). Setting: `prReview.bitbucketUsername` for App Password auth.
- **Unified PR/MR flow**: Start Review accepts GitHub, GitLab, and Bitbucket URLs; provider is chosen from the URL and used for auth, fetch, and submit.
- **Provider abstraction**: `HostType`, `PRProvider` interface, and `getProvider(host)` for GitHub, GitLab, and Bitbucket implementations.

### Changed

- Start Review now prompts for “PR or MR URL” and validates GitHub, GitLab, and Bitbucket URLs.
- Submit and Approve use the provider for the current PR’s host (e.g. GitLab API for MRs).
- Set API Key (Secure) QuickPick includes “GitLab (MR token)” and “Bitbucket (PR token)” for host tokens.

### Security

- Sanitize AI/user content in comment details modal, CodeLens hover, and tree view tooltip to prevent XSS (`sanitizeMarkdownForDisplay` used in extension, codelens, tree-view).
- Validate custom rules path: reject `prReview.customRulesPath` that escapes the workspace; fall back to `.pr-review-rules.json` and log a warning.

### Fixed

- Validate comment file path before opening: goToComment, fixInChat, generateSuggestionForComment, and viewDiffForComment now use `validateGitPath` so AI-origin paths that escape the workspace are rejected with a warning.
- Wrap GitHub CLI JSON.parse in try/catch for fetchPRInfo, fetchChangedFiles, approvePR, and submitReviewComments; show user-facing errors instead of raw parse errors when gh returns non-JSON.
- Fallback AI response parsing now includes endLine and codeSnippet on comments so they match the schema path and UI/GitHub submission behave consistently.
- Comment thread body now shows user-edited text (editedText) when present, sanitized for safe display; fixes thread not updating after Save.
- Activation now awaits the pending restore prompt so the restore stack is consistent before other code runs; avoids races when user clicks Restore and then uses the extension.

### Added

- **Cursor CLI model selection**: When AI provider is Cursor CLI, you can choose a default model via the `PR Review: Select Cursor CLI Model` command (QuickPick lists models from `agent --list-models`). The selected model is shown in the sidebar TreeView and is passed to the agent; if the model is no longer available, the extension falls back to Auto. Setting: `prReview.aiProviderCursorModel` (default: `Auto`).

### Changed

- **Cursor CLI model setting UI**: Model setting now appears only when AI provider is Cursor CLI (conditional schema), is positioned right after AI Provider (`prReview.aiProviderCursorModel`), and is a dropdown (enum) instead of a text box. Run the command for the full dynamic model list.
- `npm run release` script to tag and push for GitHub releases

### Fixed

- TreeView "getParent" / "reveal" error: implemented `getParent` on PR Review tree provider so `reveal()` works when focusing the comments view (Runtime Status error resolved).
- "No issues found" message no longer appears before AI review is run; it now correctly requires a completed review (summary exists)
- PR branch is now updated from remote (`git pull origin <branch>`) when checking out or when already on the branch, so comments align with the latest revision
- Restore flow now shows a warning when an expected stash is missing (e.g. dropped or applied elsewhere) instead of clearing the stack silently
- Clear Review only shows "Review cleared" when branch restore succeeded; on restore failure shows an explicit error and suggests restoring manually or using the Restore prompt
- Upgraded to Node.js 24 LTS in CI/CD workflows
- Commit workflow skill and improved documentation-sync rules for AI assistants

## [0.15.1] - 2025-02

### Added

- **Project-aware AI reviews**: Automatically detects project type (Node, Python, Rust, Go, Java, .NET), languages, and frameworks (React, Express, Django, etc.)
- **Language-specific rules**: TypeScript, Python, Go, Rust with tailored focus areas and anti-patterns
- **Framework-specific rules**: React, Express, Django with ecosystem best practices
- **Custom rules**: `.pr-review-rules.json` in workspace root for project-specific focus areas and ignore patterns
- `prReview.enableProjectDetection` setting (default: true)
- `prReview.customRulesPath` setting for custom rules file path
- `prReview.preferredLanguageRules` setting to override detected languages
- `PR Review: Set API Key (Secure)` command for secure API key storage
- `PR Review: Clear API Key` command to remove stored keys
- `prReview.verboseLogging` setting to disable diff/response logging (default: false)
- `prReview.clearRestoreStackOnDeactivate` setting to clear restore stack on exit
- Zod schema validation for AI review JSON responses
- Bundled sparkle icon (no external URL fetch)

### Changed

- Review prompt now includes project context and merged rules for more relevant feedback
- API key settings deprecated in favor of secure storage (existing keys auto-migrate)
- Comment body rendering uses sanitized markdown

### Security

- **API key storage**: Migrate from plain text settings to VS Code SecretStorage (OS credential manager)
- **Secure temp files**: Use cryptographically random filenames and restrictive permissions (0600) for temporary files
- **Markdown sanitization**: Sanitize AI-generated comment content to prevent XSS; set `isTrusted` and `supportHtml` to false
- **Branch validation**: Reject `..` in branch names to prevent path traversal
- **Error sanitization**: Redact API keys from error messages for all providers

## [0.13.2] - 2025-02

### Fixed

- Resolve stdin pipe issue in Electron/Node for Cursor CLI
- Prevent command injection and path traversal

## [0.13.1] - 2025-02

### Fixed

- Run git fetch before checkout to refresh remote branches
- Comments focus behavior
- Show completion toast in local flow when all comments reviewed

### Added

- Checkout PR branch and stash changes for accurate line numbers

## [0.13.0] - 2025-02

### Added

- Side-by-side diff viewer for comments

## [0.12.0] - 2025-02

### Added

- Comment actions: edit revert, fix in chat, suggested fix

## [0.11.0] - 2025-02

### Added

- Approve PR when all comments rejected

## [0.10.0] - 2025-02

### Added

- Local branch review
- No comments status display

## [0.9.0] - 2025-02

### Changed

- Improved AI prompt to stay in scope

## [0.8.7] - 2025-02

### Added

- Status bar submit button
- UX improvements

## [0.8.5] - 2025-02

### Changed

- Improved submit review UX

## [0.8.4] - 2025-02

### Fixed

- Correct Cursor CLI invocation and improve UX

## [0.8.2] - 2025-02

### Fixed

- Cursor CLI detection and setup guidance

## [0.8.1] - 2025-02

### Added

- Auto-prompt to install Cursor CLI
- README updates

## [0.8.0] - 2025-02

### Added

- Cursor CLI as AI provider (no API key needed)

## [0.7.2] - 2025-02

### Fixed

- Remove Cursor Native as default (not supported yet)

## [0.7.1] - 2025-02

### Fixed

- Friendly names in AI provider dropdown

## [0.7.0] - 2025-02

### Added

- Cursor Native AI as provider option

## [0.6.1] - 2025-02

### Changed

- Simplified UI and improved summary feedback

## [0.6.0] - 2025-02

### Added

- Annotate diff with absolute line numbers for accuracy

## [0.5.0] - 2025-02

### Fixed

- Side parameter for accurate line placement in PR comments

## [0.4.0] - 2025-02

### Added

- Streaming progress UI with real-time token tracking

## [0.3.0] - 2025-02

### Added

- AI summary
- Native comments API
- Debugging improvements

## [0.1.0] - 2025-02

### Added

- Initial release
- AI-powered PR code review
- GitHub integration
- Source Control sidebar panel
