# Phase 1: Scaffolding

Implement the VS Code extension scaffolding for the PR Review Assistant. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Starting point**: Empty workspace with only `docs/PR_REVIEW_EXTENSION_PLAN.md`
- **Goal**: A runnable VS Code extension that opens a webview panel on command

## Tasks

1. **Initialize the extension**

   - Create `package.json` with extension manifest (name: `pr-review-assistant`, displayName: `PR Review Assistant`)
   - Register commands: `prReview.start`, `prReview.import`, `prReview.callAI`, `prReview.submit`
   - Add configuration for `prReview.aiProvider` and `prReview.githubAuth`
   - Set `main` to `./dist/extension.js`
   - Add engines: `vscode: ^1.85.0`

2. **Set up TypeScript**

   - Create `tsconfig.json` targeting ES2020, module NodeNext
   - Include `src/**/*.ts`, exclude `node_modules` and `dist`

3. **Set up webpack**

   - Create `webpack.config.js` that bundles:
     - Extension entry: `src/extension.ts` → `dist/extension.js`
     - Webview entry: `src/webview/app.tsx` → `dist/webview.js` (with React)
   - Use `ts-loader` for TypeScript
   - Use `css-loader` and `style-loader` for styles
   - Add `copy-webpack-plugin` or similar to copy webview HTML to dist

4. **Create extension entry point** (`src/extension.ts`)

   - Implement `activate()` that registers the `prReview.start` command
   - When invoked, open a webview panel titled "PR Review Assistant"
   - The panel can show placeholder content initially (e.g., "PR Review panel - Phase 1")

5. **Create basic webview structure**

   - `src/webview/index.html` - HTML that loads the webview bundle
   - `src/webview/app.tsx` - React root that renders "PR Review Assistant" placeholder
   - `src/webview/panel.ts` - Function to create and configure the webview panel (loads HTML, sets up messaging)

6. **Add .vscode/launch.json**

   - Debug configuration "Launch Extension" that runs the extension in a new VS Code window

7. **Add dependencies to package.json**
   - devDependencies: typescript, webpack, webpack-cli, ts-loader, @types/node, @types/vscode, @types/react, @types/react-dom
   - dependencies: react, react-dom
   - (Octokit, Anthropic, OpenAI can be added in later phases)

## Completion Criteria

- [ ] `npm install` succeeds
- [ ] `npm run build` completes without errors
- [ ] Extension loads in VS Code (F5 or "Launch Extension")
- [ ] Command "PR Review: Start Review" appears in Command Palette
- [ ] Running the command opens a webview panel with "PR Review Assistant" visible
- [ ] No TypeScript or webpack errors

## Verification Commands

```bash
npm install
npm run build
```

Then: Press F5 to launch Extension Development Host, run "PR Review: Start Review" from Command Palette.

## Self-Correction Loop

1. Implement the scaffolding
2. Run `npm run build`
3. If build fails: read error, fix the issue, repeat
4. Launch extension (F5), test the command
5. If panel doesn't open or shows errors: fix and repeat

## Completion Signal

When all completion criteria are met, output:

```
PHASE_1_COMPLETE
```
