# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

The library lives in this repository. It is developed against a separate Expo
demo app, **`chartston-dev-test`**, checked out as a sibling folder
(`../chartston-dev-test`) and linked to this package's **source** — edits here
hot-reload there, no build step.

To get started, install the [Node.js](https://nodejs.org/) version in
[`.nvmrc`](./.nvmrc), then install dependencies with Yarn (npm is not supported):

```sh
yarn
```

Run the demo app (Expo dev client, iOS Simulator or a device):

```sh
cd ../chartston-dev-test && npx expo start --dev-client
```

Its **Home** tab exercises every feature against a live Binance feed; the
**Stress** tab runs 500 / 10k / 50k candles on a fast mock feed with fps meters.
Verify UI changes there — unit tests can't see pixels or gestures.

### Checks

```sh
yarn lint            # ESLint + Prettier (yarn lint --fix to format)
yarn typecheck       # TypeScript
yarn test            # everything below
yarn test:coverage   # core/ unit tests (vitest) + the ≥ 90 % line-coverage gate
yarn test:react      # <Chart/> integration tests (jest + Testing Library)
yarn prepare         # build lib/ with react-native-builder-bob
```

- **`src/core/**/*.test.ts`** — vitest, plain Node. Pure math, data and
  indicators; keep `core/` free of React / Skia so it stays testable here.
- **`src/react/__tests__/*.test.tsx`** — jest with the React Native preset. A
  fake feed adapter drives the real `<Chart/>` pipeline; Skia is replaced by a
  recording canvas (`skia-mock.ts`) so tests assert what was drawn.
- **[`qa/`](./qa/)** — manual checklists for gestures, rendering, real network
  and device performance. Run the S1 + S2 cases on a physical device before a
  release.

CI runs lint, typecheck, both test suites (with the coverage gate) and the
build on every push and PR.

### Scripts

- `yarn`: install dependencies.
- `yarn lint` / `yarn typecheck`: static checks.
- `yarn test`, `yarn test:coverage`, `yarn test:react`: tests (see above).
- `yarn prepare`: build the package.
- `yarn changeset`: describe a user-facing change for the changelog.

### Branching & release workflow

This project uses **three long-lived branches** plus **dated release branches**:

| Branch | Purpose |
|---|---|
| `main` | The last **stable** version. Updated **only** by merging a release branch; every merge is tagged `v<version>`. |
| `stage` | **Staging** — integration testing + fixes before a release is cut. |
| `develop` | Active **development** — features and fixes integrate here. |

- **Feature / fix work** branches off `develop`: `feat/<short-name>` or `fix/<short-name>` → PR back into `develop`.
- **Promotion:** merge `develop` → `stage` when a set of changes is ready for integration testing.
- **Release:** cut a branch named `release_<version>_<DDMMYYYY>` from `stage`
  (e.g. `release_1.0.0_27062026`), stabilize it, then merge into `main` (tag `v<version>`)
  and back into `develop`.
- **Flow:** `feat/* → develop → stage → release_<x.y.z>_<DDMMYYYY> → main` (tag) → back-merge to `develop`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `perf`, `docs`, `test`, `chore`).

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
