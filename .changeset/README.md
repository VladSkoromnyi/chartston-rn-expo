# Changesets

This folder holds [Changesets](https://github.com/changesets/changesets) — one Markdown file per user-facing change, declaring the semver bump (`patch` / `minor` / `major`) and a changelog line.

- Add one with `yarn changeset` (run it in any PR that changes published behavior).
- `yarn version-packages` (`changeset version`) consumes the pending changesets, bumps `package.json`, and writes `CHANGELOG.md`.
- `yarn release` builds (`bob`) and publishes to npm (`changeset publish`) — CI/maintainer only, requires `NPM_TOKEN`.
