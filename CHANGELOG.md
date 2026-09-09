# Changelog

## Unreleased

### Added

- Native `/switchauthprofile` command with save, create-empty and switch actions.
- Initial `default` snapshot and automatic saving of outgoing profiles.
- Shared active-profile state and locking, private file permissions and atomic credential replacement.
- Credential reload through OpenCode's instance API, with a restart notification if reloading fails.
- Isolated storage and TUI tests.
- Public package metadata, `./tui` export and macOS/Linux CI.
- Explicit npmjs publication target, publication dry-run command and release guide.
- README instructions for pinned npm installation, upgrades and package options.
