# Phase 6: Polish

Final polish for the PR Review Assistant extension. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Prerequisites**: Phases 1-5 complete - full extension works end-to-end
- **Goal**: Extension is presentable and publishable

## Tasks

1. **Add extension icon**

   - Create or add `resources/icon.png` (128x128 or 256x256)
   - Reference in package.json: `"icon": "resources/icon.png"`
   - Use a simple, recognizable icon (e.g., PR/review related)

2. **Write README.md** (project root)

   - Title: PR Review Assistant
   - Description of what it does (from plan Problem Statement)
   - Installation instructions (from marketplace or vsix)
   - Usage: Workflow A (paste from Cursor) and Workflow B (direct AI API)
   - Configuration: list all settings (aiProvider, api keys, githubAuth)
   - Commands: table of all 4 commands
   - Screenshots or ASCII mockup of the UI (optional but helpful)
   - Requirements: VS Code 1.85+, `gh` CLI for GitHub (if using gh-cli auth)

3. **Final testing**

   - Run full workflow A: paste markdown → review → submit
   - Run full workflow B: call AI API → review → submit (if configured)
   - Test error cases: no clipboard content, invalid PR number, API failures
   - Run `npm run lint` and fix any issues
   - Run `npm run build` and ensure no warnings

4. **Cleanup**

   - Remove any debug logs or TODO comments
   - Ensure no sensitive data in code
   - Verify package.json has correct version (0.1.0), description, repository if applicable

5. **Optional: Add watch script for development**

   - `npm run watch` for webpack watch mode (if not already present)

## Completion Criteria

- [ ] Extension has an icon
- [ ] README is complete and accurate
- [ ] Full workflow A works end-to-end
- [ ] Full workflow B works (when AI configured)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds with no errors
- [ ] Extension can be packaged as .vsix (`vsce package` if vsce installed)

## Verification Commands

```bash
npm run lint
npm run build
npx @vscode/vsce package  # if publishing
```

## Self-Correction Loop

1. Add icon, README, run tests
2. Fix any lint errors
3. Do a full manual test of both workflows
4. Address any issues found

## Completion Signal

When all completion criteria are met, output:

```
PHASE_6_COMPLETE
```

---

**All phases complete.** The PR Review Assistant extension is ready for use or publication.
