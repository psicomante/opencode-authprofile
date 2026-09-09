# opencode-authprofile

Save and switch named authentication profiles with `/switchauthprofile` in the [OpenCode](https://opencode.ai) terminal interface.

```text
Auth profiles — personal

Actions
  Save current as…
  New empty profile…

Saved profiles
  default
  personal                 Active
  work
```

The native menu runs JavaScript directly, without a model request. The plugin has no runtime dependencies or build step.

## Requirements

- OpenCode with native TUI plugin support. Tested with **OpenCode 1.18.30**.
- macOS or Linux. The file-permission behavior uses POSIX permissions.
- Node.js 22 or later to run the development checks.

## Install from npm

The package is prepared for its first npm release. This installation method becomes available after `opencode-authprofile@0.1.0` is published; until then, use a local checkout below.

Add the package to `~/.config/opencode/tui.json` (or `tui.jsonc`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-authprofile@0.1.0"]
}
```

OpenCode installs the package automatically at startup and loads its `./tui` export. A separate `npm install` is not needed. Append this entry to any existing plugins, then quit and restart OpenCode and run `/switchauthprofile`.

The pinned version makes upgrades explicit: change it to a published version and restart OpenCode. To follow the npm `latest` tag instead, use `"opencode-authprofile"`.

When moving from a checkout to npm, replace the local plugin entry with the package entry. Keep any custom `authFile` and `profilesDir` options to continue using the same saved profiles.

### Install from a checkout

1. Clone or download this repository to a permanent location.
2. Add its `index.js` path to the `plugin` array in `~/.config/opencode/tui.json` (or `tui.jsonc`):

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": ["/absolute/path/to/opencode-authprofile/index.js"]
   }
   ```

   Replace the example path with your checkout's absolute path. Relative paths are resolved from the TUI configuration file. Append the entry if you already have plugins configured.

3. Quit and restart OpenCode, then enter `/switchauthprofile`.

This is a **TUI plugin**, so registration belongs in `tui.json`. OpenCode configuration locations follow `$XDG_CONFIG_HOME` when set.

## Usage

| Menu item | Action |
| --- | --- |
| **Save current as…** | Copy the current credentials to a new named profile and mark it active. |
| **New empty profile…** | Create a named profile containing `{}` and activate it. Use `/connect` to sign in. |
| **Saved profiles** | Select a saved profile to replace the live `auth.json` with its credentials. |

On the first startup, the plugin saves the current credentials as `default`. If that directory already exists, it chooses `default-2`, `default-3`, and so on. Later startups retain the current live credentials and active profile.

Before switching away, the plugin saves the outgoing profile, including new logins and refreshed OAuth tokens. Selecting the already-active profile saves the live credentials without restoring an older snapshot.

Profile names start with a letter or number and contain up to 64 letters, numbers, spaces, dots, underscores or hyphens. Saving or creating a profile with an existing name is rejected.

### Example: personal and work accounts

1. Sign in using `/connect`.
2. Run `/switchauthprofile`, select **Save current as…**, and enter `personal`.
3. Select **New empty profile…** and enter `work`.
4. Use `/connect` to sign in to your work account.
5. Select `personal` from `/switchauthprofile`. The plugin saves the work credentials before restoring your personal credentials.

## Storage

By default, files live beneath `$XDG_DATA_HOME`, falling back to `~/.local/share`:

```text
opencode/
  auth.json                         Live credentials
opencode-authprofile/
  state.json                        Active profile name
  default/auth.json
  personal/auth.json
  work/auth.json
```

Saved profiles are discovered by listing directories under `opencode-authprofile`. To import one, place a valid `auth.json` inside a directory with an accepted profile name.

Profiles contain local plaintext copies of the credentials. Credential files are replaced atomically with mode `0600`; newly created profile directories use `0700`. A shared lock serializes the plugin's save and switch operations across OpenCode windows.

## Options

Override the live credential path and profile directory with a configuration tuple:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "opencode-authprofile@0.1.0",
      {
        "authFile": "/absolute/path/to/opencode/auth.json",
        "profilesDir": "/absolute/path/to/opencode-authprofile"
      }
    ]
  ]
}
```

Both options are optional and accept absolute paths. `authFile` must point to the credential file used by the OpenCode instance you want to switch.

For a local checkout, replace the package name in the tuple with the absolute path to its `index.js`.

## Reload behavior

After switching, the plugin calls OpenCode's instance reload API—the same mechanism used by `/connect`—to refresh providers in the current instance. If reloading fails, a notification reports that the file was switched and asks you to restart OpenCode.

- Finish running responses in the current instance before switching.
- The live file and active profile name are shared across OpenCode windows. Other instances may need restarting to clear cached credentials; the plugin's lock does not coordinate their provider requests or token refreshes.
- Credentials supplied through environment variables (including `OPENCODE_AUTH_CONTENT`) or provider configuration remain in effect independently of `auth.json`.
- When using `opencode attach`, file operations run on the machine hosting the TUI. The configured credential file must be the one used by the attached server.

Quit and restart OpenCode after changing the plugin or its configuration.

## Development

From the repository root:

```sh
npm run check
npm test
```

The tests use dummy credentials in temporary directories, covering profile round trips, token preservation, cancellation, invalid files, locking, permissions and reload failures.

```sh
npm pack --dry-run
```

Packing also runs syntax checks and tests. The package exports `opencode-authprofile/tui` for OpenCode's package loader and includes the runtime modules, package metadata, documentation and license.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and development workflow, and [CHANGELOG.md](CHANGELOG.md) for changes.

## Publishing to npmjs

Maintainers can validate the publication without uploading anything:

```sh
npm run publish:check
```

This runs the syntax checks and tests and previews the npm package.

## License

[MIT](LICENSE).
