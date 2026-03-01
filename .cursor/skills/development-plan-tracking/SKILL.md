---
name: development-plan-tracking
description: Executes and tracks development plans using three coordinated docs (plan, tasks, summary). Use when starting a development plan, breaking work into tasks, executing tasks from a plan, or when the user refers to plan/tasks/summary or tracked development.
---

# Development Plan Tracking

This skill uses **three coordinated files** per initiative so work can be tracked from start to end and resumed by any session.

## The Three Files

| File | Purpose | When to Use |
|------|---------|-------------|
| **{name}-plan.md** | Master plan: specs, code snippets, requirements | Implementation details and "what to build" |
| **{name}-tasks.md** | Task checklist with completion status | What's done vs pending; next task |
| **{name}-summary.md** | Running log of completed work | **READ BEFORE EACH TASK** for prior context |

**Naming:** Use a short, hyphenated initiative name (e.g. `ai-review-context`, `pr-comments-filter-hierarchy`). Store all three in `docs/` as `docs/{name}-plan.md`, `docs/{name}-tasks.md`, `docs/{name}-summary.md`.

## Mandatory Workflow (Every Task)

**BEFORE starting ANY task:**
1. **READ** the summary file (`{name}-summary.md`) completely — understand what was done before.
2. **CHECK** the tasks file (`{name}-tasks.md`) — confirm current task and status.
3. **REFERENCE** the plan file (`{name}-plan.md`) for implementation details and code snippets.

**DURING the task:**
- Follow the plan's specifications and snippets.
- Create a new branch for the task (e.g. `task/1-branch-name`).
- Run project tests frequently (e.g. `npm test`).

**AFTER completing the task:**
1. Run build and tests (e.g. `npm run build`, `npm test`, `npm run package` if applicable) — all must pass.
2. **UPDATE** the tasks file — check off ALL items for the completed task.
3. **UPDATE** the summary file — add a completed-task entry (see Summary Entry Template below).
4. Follow project commit rules (e.g. version bump, README, CHANGELOG per committing-changes skill).
5. Commit all changes, including the updated plan/tasks/summary files.

## Creating a New Initiative

When the user wants to start a **new** tracked plan:

1. **Choose a short name** (e.g. `feature-x`, `refactor-y`). All three filenames use this prefix in `docs/`.

2. **Create the plan file** (`docs/{name}-plan.md`):
   - Title (e.g. "# Feature X").
   - A "File Roles" section at the top (table of the three files and when to use each).
   - A "For AI Agents: Mandatory Workflow" subsection (before/during/after steps, as above).
   - Overview / problem summary.
   - Numbered tasks (Task 1, Task 2, …) each with: goal, branch name, changes (files + code snippets), and tests.

3. **Create the tasks file** (`docs/{name}-tasks.md`):
   - Same "File Roles" and "For AI Agents: How to Use This File" (before: read summary, check this file, reference plan; after: check off task, update summary, commit).
   - Status legend: `[ ]` Not started, `[x]` Completed, `[~]` In progress.
   - One section per task with branch name and granular checkboxes (branch created, code changes, tests, build, version/docs, summary updated, committed).

4. **Create the summary file** (`docs/{name}-summary.md`):
   - Same "File Roles" and "FOR AI AGENTS: READ THIS FILE FIRST!" (read summary → check tasks → reference plan; after task: update with the entry template).
   - Optional "Key Terminology" table if the plan introduces specific terms.
   - "Completed Tasks" section: initially empty; after each task, add an entry using the template below.

## Summary Entry Template

After each completed task, append to the summary file:

```markdown
### Task N: [Task Title]

**Branch:** `task/N-branch-name`
**Date:** YYYY-MM-DD

**Changes Made:**
- Bullet summary of what was implemented (files and key logic).
- Test results if relevant (e.g. "X/Y tests pass").

**Files Modified:** [list]

**Key Decisions:** [any deviations from plan or important choices]

**Issues / Notes:** [if any]
```

## Resuming an Existing Initiative

When the user refers to an existing plan (by name or by pointing to one of the three files):

1. Identify the initiative name from the filename (e.g. `pr-comments-filter-hierarchy-plan.md` → name is `pr-comments-filter-hierarchy`).
2. Follow the **Mandatory Workflow** above: read summary, check tasks, then use the plan for the next task.
3. Do not re-explain the three-file system in the plan/tasks/summary; they already contain the "File Roles" and workflow. Just follow them.

## Reference Examples

See existing tracked initiatives for structure templates:

- `docs/ai-review-context-{plan,tasks,summary}.md`
- `docs/pr-comments-filter-hierarchy-{plan,tasks,summary}.md`

Each has a "File Roles" table and "For AI Agents" workflow at the top. Reproduce this pattern in new initiatives.
