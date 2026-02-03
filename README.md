# PR Review Assistant

AI-powered PR code review extension for VS Code / Cursor. Lives in the **Source Control sidebar** for easy access.

## Features

- **Source Control Integration**: Panel in the SCM sidebar (like GitLens)
- **AI Code Review**: Supports Cursor CLI, Claude, GPT-4, Gemini, Groq, and more
- **Inline Annotations**: CodeLens shows comments directly on code lines
- **GitHub Integration**: Submit approved comments directly to PRs
- **One-Click Workflow**: Start review → AI analyzes → Review comments → Submit
- **No API Key Needed**: Use Cursor CLI with your existing Cursor subscription!

## Installation

### From VSIX

```bash
# Install in Cursor
cursor --install-extension pr-review-assistant-0.8.0.vsix

# Or in VS Code
code --install-extension pr-review-assistant-0.8.0.vsix
```

### Prerequisites

1. **GitHub CLI** - Required for fetching PR data and submitting comments

   ```bash
   # macOS
   brew install gh

   # Then authenticate
   gh auth login
   ```

2. **Cursor CLI** (Recommended) - Uses your Cursor subscription, no API key needed!

   ```bash
   # Install Cursor CLI
   curl https://cursor.com/install -fsSL | bash
   ```

   The extension will prompt you to install this automatically if not found.

3. **Alternative AI Providers** - If not using Cursor CLI:
   - Google Gemini (free tier available at ai.google.dev)
   - Groq (fast & free at console.groq.com)
   - Anthropic Claude (console.anthropic.com)
   - OpenAI GPT-4 (platform.openai.com)

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

| Setting                      | Description                      | Default       |
| ---------------------------- | -------------------------------- | ------------- |
| `prReview.aiProvider`        | AI provider for code review      | `cursor-cli`  |
| `prReview.anthropicApiKey`   | Anthropic API key                | -             |
| `prReview.openaiApiKey`      | OpenAI API key                   | -             |
| `prReview.geminiApiKey`      | Google Gemini API key            | -             |
| `prReview.groqApiKey`        | Groq API key                     | -             |
| `prReview.githubAuth`        | GitHub auth method               | `gh-cli`      |
| `prReview.autoRunAi`         | Auto-run AI after loading PR     | `false`       |

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
