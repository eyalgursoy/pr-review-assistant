# PR Review Assistant

AI-powered PR code review extension for VS Code / Cursor. Lives in the **Source Control sidebar** for easy access.

## Features

- **Source Control Integration**: Panel in the SCM sidebar (like GitLens)
- **AI Code Review**: Supports Claude, GPT-4o, Gemini 2.0, Groq, and VS Code Language Model API
- **Inline Annotations**: CodeLens shows comments directly on code lines
- **GitHub Integration**: Submit approved comments directly to PRs
- **One-Click Workflow**: Start review → AI analyzes → Review comments → Submit

## Installation

### From VSIX

```bash
# Install in Cursor
cursor --install-extension pr-review-assistant-0.2.0.vsix

# Or in VS Code
code --install-extension pr-review-assistant-0.2.0.vsix
```

### Prerequisites

1. **GitHub CLI** - Required for fetching PR data and submitting comments

   ```bash
   # macOS
   brew install gh

   # Then authenticate
   gh auth login
   ```

2. **AI Provider** (optional) - Configure one for automatic code review:
   - Anthropic Claude
   - OpenAI GPT-4o
   - Google Gemini 2.0
   - Groq (Llama 3.3)
   - VS Code Language Model (Cursor/Copilot built-in)

## Usage

### Quick Start

1. Open the **Source Control** panel (Cmd+Shift+G)
2. Find **PR Review Assistant** section
3. Click **Start Review**
4. Paste a GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`)
5. Click **Run AI Review** (or it runs automatically if configured)
6. Review comments appear as CodeLens on the actual files
7. **Approve** / **Reject** / **Edit** each comment
8. Click **Submit PR Review** to post to GitHub

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

## Configuration

Open Settings (Cmd+,) and search for `prReview`:

| Setting                      | Description                      | Options                                                      |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `prReview.aiProvider`        | AI provider for code review      | `anthropic`, `openai`, `gemini`, `groq`, `vscode-lm`, `none` |
| `prReview.anthropicApiKey`   | Anthropic API key                | -                                                            |
| `prReview.openaiApiKey`      | OpenAI API key                   | -                                                            |
| `prReview.geminiApiKey`      | Google Gemini API key            | -                                                            |
| `prReview.groqApiKey`        | Groq API key                     | -                                                            |
| `prReview.githubAuth`        | GitHub auth method               | `gh-cli` (default), `token`                                  |
| `prReview.githubToken`       | GitHub PAT (if not using gh-cli) | -                                                            |
| `prReview.autoRunAi`         | Auto-run AI after loading PR     | `true` / `false`                                             |
| `prReview.defaultBaseBranch` | Default base branch              | `main`                                                       |

### AI Provider Setup

**Anthropic Claude** (Recommended)

```json
{
  "prReview.aiProvider": "anthropic",
  "prReview.anthropicApiKey": "sk-ant-..."
}
```

**OpenAI GPT-4o**

```json
{
  "prReview.aiProvider": "openai",
  "prReview.openaiApiKey": "sk-..."
}
```

**Google Gemini 2.0**

```json
{
  "prReview.aiProvider": "gemini",
  "prReview.geminiApiKey": "..."
}
```

**Groq (Fast & Free tier)**

```json
{
  "prReview.aiProvider": "groq",
  "prReview.groqApiKey": "gsk_..."
}
```

**VS Code Language Model (Cursor/Copilot)**

```json
{
  "prReview.aiProvider": "vscode-lm"
}
```

No API key needed - uses Cursor's built-in AI or GitHub Copilot.

## Commands

All commands are available from the sidebar, but also via Command Palette:

| Command                    | Description                      |
| -------------------------- | -------------------------------- |
| `PR Review: Start Review`  | Enter PR URL and load            |
| `PR Review: Run AI Review` | Analyze code with AI             |
| `PR Review: Submit Review` | Post approved comments to GitHub |
| `PR Review: Clear Review`  | Reset and start fresh            |

## Comment Actions

For each AI-generated comment:

- **Approve** (✓): Include in GitHub submission
- **Reject** (✗): Skip this comment
- **Edit** (✎): Modify the comment text before approving

## Development

```bash
# Clone and install
git clone https://github.com/pr-review/pr-review-assistant
cd pr-review-assistant
npm install

# Build
npm run build

# Watch mode
npm run watch

# Package
npm run package
```

## Requirements

- VS Code 1.85+ or Cursor
- GitHub CLI (`gh`) installed and authenticated
- Node.js 18+ (for development)

## License

MIT
