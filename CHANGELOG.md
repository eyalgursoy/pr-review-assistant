# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
