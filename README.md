# PR Review Assistant

AI-powered PR code review extension for VS Code / Cursor. Lives in the **Source Control sidebar** for easy access.

## Features

- **Source Control Integration**: Panel in the SCM sidebar (like GitLens)
- **AI Code Review**: Supports Cursor CLI, Claude, GPT-4, Gemini, Groq, and more
- **Inline Annotations**: CodeLens shows comments directly on code lines
- **GitHub, GitLab & Bitbucket**: Paste a PR/MR URL to load, run AI review, and submit comments (GitHub via `gh` CLI; GitLab and Bitbucket via token)
- **Load existing PR comments**: When you load a PR, inline review comments from the host are fetched and shown in the IDE (Comments panel, tree, CodeLens), so you can use **Fix in Chat** and other actions on reviewer feedback
- **One-Click Workflow**: Start review → AI analyzes → Review comments → Submit
- **No API Key Needed**: Use Cursor CLI with your existing Cursor subscription!
- **Secure API Key Storage**: API keys and host tokens stored in VS Code SecretStorage (OS credential manager) instead of plain text settings
- **Project-Aware Reviews**: Automatically detects project type, languages, and frameworks for context-specific review rules

## Installation

### From Extensions (Cursor / VS Code)

When published, search for **PR Review Assistant** in the Extensions panel (Cmd+Shift+X). Cursor uses the [OpenVSX](https://open-vsx.org) registry.

### From GitHub Releases

Download the latest `.vsix` from [GitHub Releases](https://github.com/eyalgursoy/pr-review-assistant/releases), then install:

```bash
# Install in Cursor
cursor --install-extension pr-review-assistant-0.17.11.vsix

# Or in VS Code
code --install-extension pr-review-assistant-0.17.11.vsix
```

Replace `0.17.2` with the version you downloaded if different.

### Prerequisites

1. **For GitHub PRs**: GitHub CLI (`gh`) – required for fetching PR data and submitting comments.

   ```bash
   # macOS
   brew install gh

   # Then authenticate
   gh auth login
   ```

2. **For GitLab MRs**: GitLab Personal or Project Access Token with `api` scope. Store via **PR Review: Set API Key (Secure)** → GitLab. Create tokens at [GitLab → Settings → Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens). Self‑managed: set `prReview.gitlabUrl` in settings.

3. **For Bitbucket PRs**: Bitbucket App Password or token with Repositories and Pull requests read/write. Store via **PR Review: Set API Key (Secure)** → Bitbucket. For App Password, set `prReview.bitbucketUsername` in settings.

4. **Cursor CLI** (Recommended) - Uses your Cursor subscription, no API key needed!

   ```bash
   # Install Cursor CLI
   curl https://cursor.com/install -fsSL | bash
   ```

   The extension will prompt you to install this automatically if not found.

5. **Alternative AI Providers** - If not using Cursor CLI:
   - Google Gemini (free tier available at ai.google.dev)
   - Groq (fast & free at console.groq.com)
   - Anthropic Claude (console.anthropic.com)
   - OpenAI GPT-4 (platform.openai.com)

## Usage

### Quick Start

1. Open the **Source Control** panel (Cmd+Shift+G)
2. Find **PR Review Assistant** section
3. Click **Start Review**
4. Paste a PR or MR URL (GitHub, GitLab, or Bitbucket; e.g. `https://github.com/owner/repo/pull/123`)
5. Click **Run AI Review** (or it runs automatically if configured)
6. Review comments appear as CodeLens on the actual files
7. **Approve** / **Reject** / **Edit** each comment
8. Click **Submit PR Review** to post to the PR/MR

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Source Control Panel                                        │
├─────────────────────────────────────────────────────────────┤
│  ▼ PR Review Assistant                                       │
│    ├── [▶ Start Review]  [✨ Run AI]  [☁ Submit]            │
│    ├── PR #123: Fix authentication bug                       │
│    ├── feature/auth → main                                   │
│    │                                                         │
│    ├── ▼ Changed Files (5 files)                            │
│    │   ├── 📄 auth.ts (2 comments)                          │
│    │   │   ├── ○ 🟠 Missing null check                      │
│    │   │   └── ✓ 🟡 Consider using optional chaining        │
│    │   ├── 📄 login.tsx (1 comment)                         │
│    │   └── 📄 api.ts                                        │
│    │                                                         │
│    └── ▼ Review Summary                                      │
│        ├── 1 pending                                         │
│        ├── 1 approved                                        │
│        └── 0 rejected                                        │
└─────────────────────────────────────────────────────────────┘
```

### Inline CodeLens

When you open a file with comments, you'll see:

```typescript
// Line 42
○ 🟠 Missing error handling for API call    ✓ Approve  ✗ Reject  ✎ Edit
💡 Wrap in try/catch and handle network errors
export async function fetchData() {
  const response = await fetch(url);  // ← Comment appears here
```

### Debugging (PR comments not loading?)

Run **PR Review: Show Log** (Cmd+Shift+P) and load the PR again; any error when fetching comments will appear there. Only **inline** review comments (on specific diff lines) are loaded, not general PR discussion.

## Configuration

Open Settings (Cmd+,) and search for `prReview`:

| Setting                               | Description                                      | Default      |
| ------------------------------------- | ------------------------------------------------ | ------------ |
| `prReview.aiProvider`                 | AI provider for code review                     | `cursor-cli` |
| `prReview.aiProviderCursorModel`     | Cursor CLI model (only when provider is Cursor CLI; dropdown). Run command for full list. | `Auto` |
| `prReview.anthropicApiKey`           | Anthropic API key (deprecated: use Set API Key) | -            |
| `prReview.openaiApiKey`              | OpenAI API key (deprecated: use Set API Key)     | -            |
| `prReview.geminiApiKey`              | Google Gemini API key (deprecated: use Set API Key) | -         |
| `prReview.groqApiKey`                | Groq API key (deprecated: use Set API Key)       | -            |
| `prReview.githubAuth`                | GitHub auth method                              | `gh-cli`     |
| `prReview.gitlabUrl`                 | GitLab instance URL (e.g. https://gitlab.com or self‑managed) | `https://gitlab.com` |
| `prReview.gitlabToken`               | GitLab token (deprecated: use Set API Key → GitLab) | -        |
| `prReview.bitbucketToken`            | Bitbucket token (deprecated: use Set API Key → Bitbucket) | -      |
| `prReview.bitbucketUsername`         | Bitbucket username (for App Password auth)       | -            |
| `prReview.autoRunAi`                 | Auto-run AI after loading PR                     | `false`      |
| `prReview.verboseLogging`            | Log diff and AI response content (privacy: off)  | `false`      |
| `prReview.clearRestoreStackOnDeactivate` | Clear branch restore stack on extension exit | `false`      |
| `prReview.enableProjectDetection`   | Auto-detect project type and apply language/framework rules | `true`       |
| `prReview.customRulesPath`          | Path to custom rules file (e.g. .pr-review-rules.json)     | ``           |
| `prReview.preferredLanguageRules`   | Override detected languages (comma-separated, e.g. typescript,python) | `` |
| `prReview.showResolvedOrOutdated`  | Show or hide host-resolved/outdated comments      | `hide`       |

### Secure API Key Storage (Recommended)

Use the **Set API Key (Secure)** command instead of storing keys in settings. Keys are stored in your OS credential manager:

1. Open Command Palette (Cmd+Shift+P)
2. Run **PR Review: Set API Key (Secure)**
3. Select your AI provider (or GitLab / Bitbucket for host tokens) and paste your key

Use this for AI providers (Anthropic, OpenAI, Gemini, Groq) and for GitLab and Bitbucket tokens when reviewing MRs/PRs on those hosts. Keys stored in settings are deprecated and can be migrated to secure storage via this command.

### Custom Review Rules

Create `.pr-review-rules.json` in your workspace root to add project-specific rules:

```json
{
  "focusAreas": ["Our API uses camelCase for all endpoints"],
  "antiPatterns": ["Hardcoded environment URLs"],
  "bestPractices": ["Use our shared ErrorBoundary for error handling"],
  "ignore": ["generated/", "*.d.ts"]
}
```

Or set `prReview.customRulesPath` to use a different file path.

### AI Provider Setup

**Cursor CLI** (Recommended - No API Key!)

```bash
# One-time setup
curl https://cursor.com/install -fsSL | bash
```

```json
{
  "prReview.aiProvider": "cursor-cli"
}
```

Uses your existing Cursor subscription. Works with Claude, GPT-5, Gemini, and more!

When using Cursor CLI, you can pick a default model: run **PR Review: Select Cursor CLI Model** from the Command Palette to choose from available models (or leave as **Auto**). The selected model is shown in the sidebar TreeView and is used when you run AI review; if the model is no longer available, the extension falls back to Auto.

**Google Gemini** (Free tier available)

```json
{
  "prReview.aiProvider": "gemini",
  "prReview.geminiApiKey": "..."
}
```

Get a free API key at [ai.google.dev](https://ai.google.dev)

**Groq** (Fast & Free)

```json
{
  "prReview.aiProvider": "groq",
  "prReview.groqApiKey": "gsk_..."
}
```

Get a free API key at [console.groq.com](https://console.groq.com)

**Anthropic Claude**

```json
{
  "prReview.aiProvider": "anthropic",
  "prReview.anthropicApiKey": "sk-ant-..."
}
```

**OpenAI GPT-4**

```json
{
  "prReview.aiProvider": "openai",
  "prReview.openaiApiKey": "sk-..."
}
```

## Commands

All commands are available from the sidebar, but also via Command Palette:

| Command                               | Description                      |
| ------------------------------------- | -------------------------------- |
| `PR Review: Start Review`             | Enter PR URL and load            |
| `PR Review: Run AI Review`            | Analyze code with AI             |
| `PR Review: Submit Review`            | Post approved comments to GitHub |
| `PR Review: Clear Review`             | Reset and start fresh            |
| `PR Review: Select Cursor CLI Model`  | Pick model for Cursor CLI (when provider is Cursor CLI) |
| `PR Review: Set API Key (Secure)`     | Store API key in secure storage  |
| `PR Review: Clear API Key`            | Remove stored API key            |

## Comment Actions

For each AI-generated comment:

- **Approve** (✓): Include in GitHub submission
- **Reject** (✗): Skip this comment
- **Edit** (✎): Modify the comment text before approving

## Development

```bash
# Clone and install
git clone https://github.com/eyalgursoy/pr-review-assistant
cd pr-review-assistant
npm install

# Build
npm run build

# Watch mode
npm run watch

# Package
npm run package

# Release (tag and push to trigger GitHub release)
npm run release
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development and contribution guidelines.

## Requirements

- VS Code 1.85+ or Cursor
- GitHub CLI (`gh`) installed and authenticated
- Node.js 24+ (for development)

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md). Do not open public issues for security vulnerabilities.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

MIT License. See [LICENSE](LICENSE) for details.
