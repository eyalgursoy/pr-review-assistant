# Contributing to PR Review Assistant

## Development Setup

```bash
# Clone the repository
git clone https://github.com/pr-review/pr-review-assistant
cd pr-review-assistant

# Install dependencies
npm install

# Build the extension
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

## Testing Locally

### Option 1: F5 Debug Launch

1. Open the project in VS Code/Cursor
2. Press **F5** to launch Extension Development Host
3. Test the extension in the new window

### Option 2: Install VSIX

```bash
# Package the extension
npm run package

# Install in Cursor
cursor --install-extension pr-review-assistant-0.1.0.vsix

# Or in VS Code
code --install-extension pr-review-assistant-0.1.0.vsix
```

## Available Scripts

| Script               | Description                    |
| -------------------- | ------------------------------ |
| `npm run build`      | Build production bundle        |
| `npm run watch`      | Build in watch mode (dev)      |
| `npm test`           | Run unit tests                 |
| `npm run test:watch` | Run tests in watch mode        |
| `npm run package`    | Create .vsix package           |
| `npm run publish`    | Publish to VS Code Marketplace |

## Releasing a New Version

### 1. Update Version Number

Edit `package.json`:

```json
{
  "version": "0.2.0" // bump from 0.1.0
}
```

### 2. Update Changelog (Optional)

Create or update `CHANGELOG.md` with release notes.

### 3. Build and Test

```bash
# Run tests
npm test

# Build
npm run build

# Test locally
npm run package
cursor --install-extension pr-review-assistant-0.2.0.vsix
```

### 4. Package for Distribution

```bash
npm run package
# Creates: pr-review-assistant-0.2.0.vsix
```

### 5. Publish to Marketplace (Optional)

To publish to the VS Code Marketplace:

1. **Create a Publisher Account**

   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create a publisher (e.g., "pr-review")

2. **Get a Personal Access Token**

   - Go to https://dev.azure.com
   - User Settings → Personal Access Tokens
   - Create token with "Marketplace (Manage)" scope

3. **Login and Publish**

   ```bash
   # Install vsce globally (if not using npx)
   npm install -g @vscode/vsce

   # Login to your publisher
   vsce login <publisher-name>

   # Publish
   npm run publish
   # Or: vsce publish
   ```

4. **Publish with Version Bump**
   ```bash
   vsce publish patch  # 0.1.0 → 0.1.1
   vsce publish minor  # 0.1.0 → 0.2.0
   vsce publish major  # 0.1.0 → 1.0.0
   ```

### 6. Create GitHub Release (Optional)

```bash
git tag v0.2.0
git push origin v0.2.0
```

Then create a release on GitHub and attach the `.vsix` file.

## Project Structure

```
pr-review-assistant/
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── parser.ts         # AI output parser (JSON/markdown)
│   ├── state.ts          # Review state management
│   ├── github.ts         # GitHub API integration
│   ├── ai.ts             # AI API clients (Anthropic/OpenAI)
│   ├── git.ts            # Git utilities
│   └── webview/          # React UI
│       ├── app.tsx       # Main React app
│       ├── panel.ts      # Webview panel setup
│       └── components/   # React components
├── resources/
│   └── icon.png          # Extension icon
├── dist/                 # Built output (gitignored)
├── package.json          # Extension manifest
└── webpack.config.js     # Build configuration
```

## Code Style

- TypeScript strict mode
- React functional components with hooks
- Immutable state updates
- VS Code theming variables for UI

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx vitest run src/parser.test.ts
```

## Questions?

Open an issue on GitHub or submit a pull request!
