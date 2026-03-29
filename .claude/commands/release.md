# Release — publish a new version of claude-connector

You are performing a full release of the `@scottwalker/claude-connector` package.

## Input

The user provides:
- `$ARGUMENTS` — a short description of what changed in this release (features, fixes, etc.)

If `$ARGUMENTS` is empty, run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD` to collect changes since the last tag and use those as the changelog basis.

## Release steps

Execute ALL steps below in order. Do NOT skip any step.

### 1. Determine the new version

- Read `package.json` to get the current version.
- Analyze the changes (from `$ARGUMENTS` and/or git log) and determine the bump type using Semantic Versioning:
  - **patch** (0.4.8 → 0.4.9) — bug fixes, documentation, refactoring, style changes, dependency updates, test additions, CI tweaks. No new functionality for the end user.
  - **minor** (0.4.8 → 0.5.0) — new features, new API methods, new CLI commands, new options, new exports. Backward-compatible additions that give users new capabilities.
  - **major** (0.4.8 → 1.0.0) — breaking changes: removed/renamed public API, changed method signatures, changed default behavior, dropped Node.js version support, changed package exports structure.
- If the user explicitly specifies a bump type in `$ARGUMENTS` (e.g. "patch", "minor", "major"), use that instead.
- Print your reasoning: what changed and why you chose that bump type. Ask the user to confirm before proceeding.
- Store the new version as `NEW_VERSION` and today's date as `RELEASE_DATE` (YYYY-MM-DD).

### 2. Update version in all files

Update the version string in **every** file listed below. Do NOT miss any:

| File | What to change |
|---|---|
| `package.json` | `"version": "X.Y.Z"` |
| `src/cli/index.ts` | `.version('X.Y.Z')` |
| `wiki/.vitepress/config.ts` | `text: 'vX.Y.Z'` |
| `landing/index.html` | `v0.X.Y` in the badge div (search for `Available on npm`) |

After editing, run `npm install --package-lock-only` to sync `package-lock.json`.

### 3. Update changelogs

Add a new entry at the **top** of the existing entries (below the header) in both:

- `CHANGELOG.md` — full Keep a Changelog format with `## [X.Y.Z] - RELEASE_DATE`
- `wiki/changelog.md` — same content, mirrored

Use the change description from `$ARGUMENTS` (or git log from step 1). Group changes under `### Added`, `### Changed`, `### Fixed` as appropriate.

### 4. Update documentation

Review ALL changes being released and ensure documentation reflects them. Check and update:

- **README.md** — if new features, options, CLI commands, or API methods were added, document them with examples
- **docs/API.md** — if new types, methods, or options were added
- **docs/EXAMPLES.md** — if new usage patterns are relevant
- **wiki/guide/** — if new features need a guide page or updates to existing guides
- **landing/index.html** — if new features should be showcased (e.g. CLI commands, key capabilities), update the feature sections, stats (test count, package size), and any relevant code examples

Do NOT skip this step. Every user-facing change MUST be documented before release. Read the existing docs first to understand the structure, then add the new content in the same style.

### 5. Build and verify

Run these commands and ensure they all pass:

```
npm run build
npm run typecheck
npm test
```

If any step fails, fix the issue before continuing.

### 6. Commit

Create a single commit with message:
```
release: vX.Y.Z

<one-line summary of changes>
```

Stage only the files that were changed. Do NOT use `git add -A`.

### 7. Create git tag

```
git tag vX.Y.Z
```

### 8. Publish to npm

```
npm publish
```

### 9. Push to remote

```
git push && git push --tags
```

### 10. Create GitHub release

```
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog entry>"
```

### 11. Report

Print a summary:
- Version published
- npm link
- GitHub release link
- List of files changed

## Important rules

- ALWAYS ask for confirmation before running `npm publish` and `git push`.
- If build or tests fail, stop and fix before publishing.
- Never publish a version that doesn't build or pass tests.
