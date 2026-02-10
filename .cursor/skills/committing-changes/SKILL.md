---
name: committing-changes
description: Guides AI through the complete commit workflow including version bumping, documentation updates, and changelog entries. Use when the user asks to commit changes, create a commit, or save work to git.
---

# Committing Changes

This skill ensures commits include proper version bumps and documentation updates.

## When to Use

Activate this skill when the user asks to:
- Commit changes
- Create a commit
- Save changes to git
- Push changes

## Pre-Commit Checklist

Copy and complete this checklist before committing:

```
Commit Checklist:
- [ ] Step 1: Analyze changes (what type: feature/fix/breaking?)
- [ ] Step 2: Determine version bump (MAJOR/MINOR/PATCH/none)
- [ ] Step 3: Update package.json version
- [ ] Step 4: Update README.md (version + any new commands/settings)
- [ ] Step 5: Update CHANGELOG.md [Unreleased] section
- [ ] Step 6: Stage and commit all files
- [ ] Step 7: Verify commit succeeded
```

## Step 1: Analyze Changes

Run `git diff --cached` and `git diff` to see all changes.

Classify the change type:

| Type | Description | Examples |
|------|-------------|----------|
| **Feature** | New user-facing capability | New command, new setting, new UI element |
| **Fix** | Bug correction | Error handling, incorrect behavior |
| **Breaking** | Incompatible change | Removed feature, changed API |
| **Docs-only** | No code changes | README typo, comment updates |
| **Refactor** | No user-visible change | Internal restructuring |

## Step 2: Determine Version Bump

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking change | MAJOR | 0.15.2 → 1.0.0 |
| New feature | MINOR | 0.15.2 → 0.16.0 |
| Bug fix / small improvement | PATCH | 0.15.2 → 0.15.3 |
| Docs-only / refactor | NONE | No bump needed |

**CRITICAL**: Adding a new npm script, command, or configuration = PATCH minimum.

## Step 3: Update package.json

If version bump needed, update the `version` field in `package.json`.

## Step 4: Update README.md

Check if changes require README updates:

| Change | README Section to Update |
|--------|-------------------------|
| New npm script | Development section |
| New VS Code command | Commands table |
| New configuration setting | Configuration table |
| New feature | Features list |
| Changed prerequisites | Prerequisites section |
| Version bump | Installation example version number |

**Version in README**: Update the `.vsix` filename in the "From GitHub Releases" section:
```
cursor --install-extension pr-review-assistant-X.X.X.vsix
```

## Step 5: Update CHANGELOG.md

Add entry under `[Unreleased]` section using appropriate category:

| Category | Use For |
|----------|---------|
| Added | New features, commands, settings |
| Changed | Behavior changes, improvements |
| Deprecated | Soon-to-be-removed features |
| Removed | Removed features |
| Fixed | Bug fixes |
| Security | Security improvements |

Format: Brief description starting with action verb.

## Step 6: Stage and Commit

Stage all modified files:
```bash
git add package.json README.md CHANGELOG.md [other changed files]
```

Commit with descriptive message:
```bash
git commit -m "$(cat <<'EOF'
Brief summary (vX.X.X if version bumped)

- Detail 1
- Detail 2
EOF
)"
```

## Step 7: Verify

Run `git status` to confirm:
- Working tree is clean
- Commit was created successfully

## Quick Reference: Files to Check

For ANY commit with user-visible changes:

1. **package.json** - Version field
2. **README.md** - Version in install command + relevant sections
3. **CHANGELOG.md** - [Unreleased] section

## Common Mistakes to Avoid

- Committing without version bump for new features/fixes
- Updating package.json version but forgetting README.md
- Forgetting CHANGELOG.md entry
- Using wrong changelog category
