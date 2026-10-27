# Release checklist

## Version policy

Initial public source version: **0.1.0**. Planned version tag: `v0.1.0`.
The project is in early development and does not claim a stable 1.0 contract.

- Patch releases contain compatible fixes; minor releases add features or
  intentional compatibility changes during 0.x, with migration notes as needed.
- Use `0.2.0-rc.1` style prereleases for candidates; reserve 1.0 for a reviewed
  stability milestone.
- Keep package.json, both root package-lock.json versions, Cargo.toml, the
  jj-bond Cargo.lock entry and tauri.conf.json synchronized. Track lockfiles.
- Update CHANGELOG.md and create the version tag only when authorizing a release.

## Source release

- [x] Public repository and maintainer channel: zhm20001/jj-bond and GitHub Issues.
- [x] Publish a fresh snapshot root commit instead of exporting local development history.
- [x] Current hand-authored icon and provenance documented in assets/README.md.
- [x] Dependency license texts, source URLs and checksum validation in LICENSES/.
- [x] Local frontend checks, 38 Rust tests, formatting and Clippy pass.
- [x] Add macOS screenshots from a disposable demo repository.
- [x] Enable desktop CSP and restrict development-bridge access; regression tests pass.
- [x] Configure macOS, Linux and Windows CI; consult actual Actions results per commit.

## Binary release (separate from source publication)

- [x] Check six version entries agree on 0.1.0.
- [x] Build the macOS .app and verify included icon and license resources.
- [x] Test macOS open/refresh/diff/describe/rebase/conflict/undo/redo workflows.
- [x] Desktop launch finds jj; minimal-PATH regression actually executes.
- [ ] Complete directory-picker cancel/navigation edge cases.
- [ ] Run interactive Windows/Linux GUI and installer tests.
- [ ] Configure Developer ID signing and notarization; no usable certificate is installed.
- [ ] Decide a permanent bundle identifier before changing installed app identity.
- [ ] Publish signed artifacts, release notes and checksums only after those gates pass.

Use the current official [Tauri signing guide](https://v2.tauri.app/distribute/sign/macos/)
for certificate and notarization setup. Keep credentials outside the repository.
Unsigned local builds and successful compilation are not installer certification.

Detailed evidence and limits are in [VERIFICATION.md](VERIFICATION.md).
