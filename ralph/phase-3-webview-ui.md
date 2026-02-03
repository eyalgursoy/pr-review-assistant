# Phase 3: Webview UI

Build the React-based webview UI with FileList, FileViewer, and CommentCard components. Reference the full plan at [docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md).

## Context

- **Prerequisites**: Phases 1 and 2 complete - extension runs, parser and state exist
- **Key files**: `src/webview/app.tsx`, `src/parser.ts`, `src/state.ts`
- **Goal**: Interactive UI that displays findings, allows confirm/edit/reject, and communicates with extension

## Tasks

1. **Set up message passing** (`src/webview/panel.ts` and webview)

   - Extension sends `getState` response with `ReviewState` to webview
   - Webview sends messages: `updateFindingStatus`, `updateFindingComment`, `setSelectedFile`, `submitComments`
   - Use `vscode.postMessage` in webview, `webview.onDidReceiveMessage` in extension
   - Pass `getState` function or initial state when creating webview

2. **Build FileList component** (`src/webview/components/FileList.tsx`)

   - Left sidebar showing files with findings
   - Each row: checkbox (select/deselect all findings in file), filename, badge with count
   - Clicking a file sets it as selected (highlights row)
   - "Submit PR Comments" button at bottom (enabled when at least one approved finding)
   - Use Finding interface for data

3. **Build FileViewer component** (`src/webview/components/FileViewer.tsx`)

   - Displays file content with line numbers (monospace, left-aligned numbers)
   - Renders code lines; for each line with a finding, render CommentCard below it
   - If no file selected, show placeholder "Select a file from the list"
   - Fetch file content from extension (message `getFileContent` with path, extension reads from workspace)

4. **Build CommentCard component** (`src/webview/components/CommentCard.tsx`)

   - Shows: issue description, suggestion (if any), severity badge
   - Action buttons: Confirm, Edit, Reject
   - States: pending (gray border), approved (green/checkmark), rejected (red/strikethrough), edited (blue badge)
   - Confirm → update status to approved
   - Reject → update status to rejected
   - Edit → show inline textarea, save updates editedComment and marks as edited

5. **Wire up App** (`src/webview/app.tsx`)

   - Two-column layout: FileList (left, ~250px), FileViewer (right, flex)
   - Receive state from extension via message
   - Pass state to FileList and FileViewer
   - Handle message responses for state updates (optimistic or request new state from extension)

6. **Add keyboard shortcuts** (in webview)

   - When CommentCard is focused: Enter = Confirm, Escape = Reject

7. **Add styles** (`src/webview/styles/main.css`)

   - Use CSS (or Tailwind if already configured) for layout, borders, badges
   - Match the UI mockup from plan (lines 55-73): file list, code view, comment cards

8. **Connect extension to parser and state**

   - `prReview.import`: Read clipboard, call `parseReview`, create/update state, send to webview
   - `prReview.start`: Prompt for PR number (and optionally repo owner/name), open panel with empty or existing state
   - Ensure webview receives state when opened and when imported

## Completion Criteria

- [ ] `npm run build` succeeds
- [ ] Extension opens panel; FileList and FileViewer render
- [ ] With mock data (hardcode 2-3 findings), UI displays correctly
- [ ] Confirm/Edit/Reject on CommentCard updates state (visible in UI)
- [ ] Selecting a file in FileList shows its content in FileViewer
- [ ] "Submit PR Comments" button appears and is clickable (actual submit in Phase 4)
- [ ] Import from Clipboard: paste markdown, run command, findings appear in UI
- [ ] No console errors in webview

## Verification Commands

```bash
npm run build
```

Then: F5, run "PR Review: Start Review", enter PR number, run "PR Review: Import from Clipboard" with this in clipboard:

```markdown
**File:** `src/utils/api.ts` (line 4)
**Issue:** Missing error handling
**Suggestion:** Wrap fetch call in try/catch block
```

## Self-Correction Loop

1. Implement components
2. Build and launch extension
3. If UI doesn't render or has errors: check webview console, fix, repeat
4. Test with mock data first, then with Import from Clipboard

## Completion Signal

When all completion criteria are met, output:

```
PHASE_3_COMPLETE
```
