# Changelog

## 0.1.0 — initial public release

Initial public release. Local verification targets macOS and jj 0.46.0.

### Features

- Revision graph with revset filtering, multi-selection and drag-to-rebase.
- Revision details, file lists, unified and side-by-side diffs.
- Edit/new revisions, descriptions, bookmarks, conflict resolution, undo and redo.
- Native repository picker, resizable panels and persisted preferences.
- Chinese and English interface with light, dark and system themes.
- Tauri desktop application and a local browser development bridge using jj CLI.

### Reliability and performance

- One jj log invocation for graph data and ordering; fewer revision clones.
- Drag-preview updates avoid rendering the entire graph on each pointer move.
- Exact diff totals are returned alongside file details without an extra jj call.
- Finder/Dock jj discovery merges login-shell and fallback paths; shell output
  reads and process waiting share a timeout.
- Temporary-repository regression tests cover core jj behavior and diff totals;
  the Finder PATH check verifies that its child test actually executes.

- Original dependency license texts and source links are bundled and checked.
- The development bridge enforces local same-origin access and bounded JSON bodies.
- Desktop CSP restricts resource loading; only the native open-dialog permission is granted.
- CI covers macOS, Linux and Windows build/test jobs.

### Known release limits

- Core macOS desktop workflows were tested with a disposable repository.
  Windows/Linux GUI behavior still needs interactive validation; their
  installers are CI builds.
- Installers are published unsigned from GitHub Releases and a Homebrew tap;
  Developer ID signing and notarization are planned once an Apple Developer
  Program membership is available. macOS first launch needs a one-time
  Gatekeeper approval (see the README install section).
- Per-file line counts still use scaled diff-stat histograms; large individual
  files may show approximate counts even though overall totals are exact.
- See docs/RELEASING.md for remaining publication gates.
