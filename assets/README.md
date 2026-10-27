# Application icon

`icon01.svg` is the master app icon for jj-bond: a hand-authored 1024x1024
vector. A light ivory rounded-square tile (`#F8F7F4`) carries a dark navy
(`#1A233A`) letter J drawn as a git graph and tilted 30 degrees — the solid
circle at the hook is a mutable commit, the arrow at the top of the stem
points at the purple (`#7357A8`) diamond marking jj's immutable commit. The
same SVG is rendered as the toolbar brand mark in the UI.

Generate platform sizes with `npm run tauri icon -- assets/icon01.svg`.
The CLI also emits `src-tauri/icons/ios` and `src-tauri/icons/android`;
this desktop project retains desktop outputs only, so delete those two
directories after regenerating. The earlier AI-generated master
(`icon-source.png`) and candidates (`icon-v2.png`, `icon-v3.png`) were
replaced by this SVG and removed.
