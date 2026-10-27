# Release verification — 0.1.0

Recorded 2026-10-26–27. Local environment: macOS arm64, Node 24.15.0,
Rust 1.95.0, jj 0.46.0. Results below distinguish executed checks from setup.

## Automated checks executed locally

- npm clean install, frontend helper and real-repository bridge tests, TypeScript
  checking and Vite production build passed.
- 38 Rust library tests passed, including Finder-style minimal-PATH execution,
  bounded shell-output reads, actual undo/redo state, conflicts and diff totals.
- cargo fmt --check and cargo clippy --locked --all-targets passed. The earlier
  formatting debt has been removed without behavioral changes.
- npm audit reported zero known vulnerabilities at the time of checking.
- License verification covers 479 packages: 473 locked Cargo dependencies and six
  npm production dependencies. Each entry has source URLs and original texts
  with SHA-256 checksums. This includes build/platform dependencies as a superset.
- The macOS release .app built successfully. All bundled LICENSES files were
  compared byte-for-byte with the checked-in originals. App icon is icon01.svg.
- Bridge tests reject foreign/null Origin, non-loopback Host, cross-site browser
  requests, non-JSON mutations, unsupported methods and bodies over 1 MiB;
  local same-origin and CLI requests remain supported.
- Desktop production CSP is enabled, without unsafe-eval or inline scripts.
  Inline styles remain allowed for React positioning and theme variables.
  Capability access is local to the main window; plugin access is limited to
  dialog:allow-open. The development CSP separately allows Vite's inline script.

## Native macOS GUI checks executed

The release app was launched through desktop application launch services,
not a terminal command. Tests used a disposable repository with synthetic
identity and content. Original application preferences were restored afterward.

- Open repository, refresh graph, select revisions and display file details.
- Unified and side-by-side diffs, including the +/−/± file indicators.
- Describe a revision, then undo and redo; the displayed description changed back
  and forward, and the underlying repository state was checked.
- Drag rebase, inspect confirmation, confirm; the new parent was verified with jj.
- Display a two-sided conflict, choose ours and confirm; the working file contained
  the expected side and jj reported conflict=false. Undo restored the conflict;
  redo removed it again.
- English/light and Chinese/dark rendering. Screenshots in screenshots/ contain
  only the disposable demo repository.
- Empty-state Open Repository action successfully opened a repository; automated
  precise directory-picker navigation was not reliably controlled, so picker
  cancel/navigation edge cases are not claimed as verified.

## Public snapshot and hosted checks

The public repository is https://github.com/zhm20001/jj-bond; maintainer contact
is its Issues page. The initial public import is a fresh root commit of the
reviewed tree. Local development history, reflogs, .git and .jj metadata are not
exported. Future fixes can use normal public commits.

A heuristic scan of the prior local history found a local path in a removed
reference note, not evidence of repository corruption. The snapshot export
excludes that history. This scan is not a comprehensive security audit.

CI runs frontend checks, license coverage, formatting, Clippy, Rust tests and
an unsigned desktop executable build on macOS, Ubuntu 24.04 and Windows.
See the [actual Actions results](https://github.com/zhm20001/jj-bond/actions)
for each public commit. Configuring the matrix alone is not a passing result.
A successful job verifies builds/tests, not interactive GUI behavior.

## Remaining external release gates

- No usable macOS code-signing identity was present (security find-identity
  reported zero). Developer ID signing and Apple notarization require the
  maintainer's account/certificate. No credentials were created or requested.
- No Windows/Linux desktop session was available for interactive testing.
- No signed installer or binary GitHub release is published by the source import.
- The existing com.jj-bond.app identifier still causes Tauri's naming warning;
  changing application identity is deferred to a deliberate installer migration.
- Per-file line counts still come from scaled histograms; overall totals are exact.

These are explicitly a source release and macOS smoke-test baseline, not a
claim of complete cross-platform installer certification.
