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
- [x] Decision (2026-10-27): publish installers **unsigned** with SHA-256
      checksums, first-launch instructions and a Homebrew tap; Developer ID
      signing and notarization wait until an Apple Developer Program
      membership is authorized.
- [x] Publish release notes and checksums with the unsigned status stated
      (GitHub Releases plus the `zhm20001/tap` Homebrew tap).
- [ ] Complete directory-picker cancel/navigation edge cases.
- [ ] Run interactive Windows/Linux GUI and installer tests. Until then,
      Windows/Linux installers are CI builds without interactive validation.
- [ ] Configure Developer ID signing and notarization; no usable certificate
      is installed. Once available, publish signed installers and update the
      tap cask and first-launch instructions.
- [ ] Decide a permanent bundle identifier before changing installed app identity.

Use the current official [Tauri signing guide](https://v2.tauri.app/distribute/sign/macos/)
for certificate and notarization setup. Keep credentials outside the repository.
Unsigned publication is a deliberate transition decision recorded above, not a
claim of installer certification.

## Release process

1. Keep the six version entries, `CHANGELOG.md` and this checklist in sync.
2. Push a `v*` tag. The `Release` workflow builds unsigned installers on
   macOS (universal `.dmg`), Windows (`.exe`, `.msi`) and Linux
   (`.deb`, `.rpm`, `.AppImage`), uploads them with per-platform
   `checksums-*.txt` files, and opens a **draft** GitHub release.
3. Verify the draft assets locally (checksums, mount and launch the `.dmg`),
   finalize the notes — including the unsigned status and first-launch
   instructions — then publish the draft.
4. Update the `jj-bond` cask in
   [zhm20001/homebrew-tap](https://github.com/zhm20001/homebrew-tap) with the
   new version, URL and SHA-256, then install once via
   `brew install --cask zhm20001/tap/jj-bond` to verify.

Detailed evidence and limits are in [VERIFICATION.md](VERIFICATION.md).
