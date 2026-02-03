# Ralph-Style Phase Prompts for PR Review Extension

This directory contains phase-based prompts for implementing the PR Review Extension using the Ralph methodology: iterative, self-referential AI development with clear completion criteria.

## What is Ralph?

Ralph is a development methodology based on continuous AI agent loops. The core idea: **iterate until done**. Each phase has:

- **Clear completion criteria** - Testable success conditions
- **Self-correction loop** - Run tests, fix failures, repeat
- **Incremental goals** - Small, achievable steps

## How to Use in Cursor

### Workflow

1. **Open the phase prompt** (e.g., `ralph/phase-1-scaffolding.md`)
2. **Copy the full prompt content** into Cursor chat
3. **Let Cursor implement** the phase
4. **Run verification commands** from the prompt
5. **If tests fail**, paste the error output back to Cursor
6. **Iterate** until all completion criteria are met
7. **Output the completion signal** (e.g., `PHASE_1_COMPLETE`)
8. **Move to the next phase**

### Phase Order

Execute phases in order. Each phase builds on the previous:

| Phase | File                      | Focus                                               |
| ----- | ------------------------- | --------------------------------------------------- |
| 1     | `phase-1-scaffolding.md`  | VS Code extension setup, webpack, basic webview     |
| 2     | `phase-2-parser-state.md` | JSON/markdown parsers, state manager                |
| 3     | `phase-3-webview-ui.md`   | React components: FileList, FileViewer, CommentCard |
| 4     | `phase-4-github.md`       | GitHub CLI and Octokit integration                  |
| 5     | `phase-5-ai.md`           | Anthropic/OpenAI API clients, diff fetching         |
| 6     | `phase-6-polish.md`       | Icon, README, final testing                         |

### Key Reference

The full PRD is in [../docs/PR_REVIEW_EXTENSION_PLAN.md](../docs/PR_REVIEW_EXTENSION_PLAN.md). Reference it for:

- Architecture diagram
- UI design mockup
- TypeScript interfaces
- Package.json manifest
- Implementation task details

## Tips

- **Don't skip phases** - Each phase has dependencies on the previous
- **Use `--max-iterations`** - If running automated Ralph loops, set a limit (e.g., 20) to prevent infinite loops
- **Paste errors back** - When tests fail, include the full error output so Cursor can fix it
- **Verify before moving on** - Ensure all completion criteria pass before starting the next phase
