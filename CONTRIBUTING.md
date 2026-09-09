# Contributing

The repository is [psicomante/opencode-authprofile](https://github.com/psicomante/opencode-authprofile). Report bugs and request features in [GitHub Issues](https://github.com/psicomante/opencode-authprofile/issues), and submit changes through pull requests.

## Getting started

Clone the repository:

```sh
git clone https://github.com/psicomante/opencode-authprofile.git
cd opencode-authprofile
```

Use Node.js 22 or later. The project has no dependencies to install and no build step.

## Layout

| File | Responsibility |
| --- | --- |
| `index.js` | TUI plugin entry point, slash command, dialogs and instance reload. |
| `store.js` | Profile naming, credential snapshots, atomic writes and shared state. |
| `index.test.js` | Menu actions and reload behavior using a simulated TUI API. |
| `store.test.js` | File operations and credential preservation in temporary directories. |

Keep the native TUI integration separate from the file-store operations. Use the surrounding JavaScript style: ES modules, two-space indentation and no semicolons.

## Checks

```sh
npm run check
npm test
```

Tests create and clean up temporary directories with dummy credentials. Set `AUTH_PROFILE_TEST_TMPDIR` to an existing directory to override their parent location.

For behavior changes, add a focused test demonstrating the expected outcome. Update the README and changelog when changing user-facing behavior. CI runs the checks and packaging step on macOS and Linux with Node.js 22, 24 and 26.

For interactive changes, register a local checkout in `tui.json` as described in the README, then quit and restart OpenCode. Use an isolated OpenCode data directory with dummy credentials to exercise save, create-empty and switch actions.

## Package preparation

```sh
npm pack --dry-run
```

The `prepack` script runs syntax checks and tests. The `files` allowlist includes the two runtime modules and supporting documentation; npm includes the package metadata, README and license automatically. The `./tui` export is required for OpenCode to load the packaged plugin.

Before publishing a release, set the package version and update the changelog. Follow [PUBLISHING.md](PUBLISHING.md) for registry configuration, the dry run and publication commands.
