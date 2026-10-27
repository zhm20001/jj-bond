# Open-source preparation

Approved scope: preserve existing functionality, initialize colocated jj/Git history,
remove development-only residue, make tests reproducible, document setup and
contributions, add CI, and record licensing provenance. No broad UI rewrite.

Keep the browser bridge as a development tool: removing it would remove an existing
workflow. Keep Rust as the desktop backend. Remove copied reference files after
confirming authorship of the drag helper.

Use Apache-2.0 for the project, as explicitly requested by the author. Local GG
history confirms the helper was added by the same author; no third-party GG
exception is required for this file. Record unverified release items explicitly.

Validation: frontend build and real-source helper checks; Rust tests with temporary
jj fixtures; macOS CI; source and dependency review. Commit each coherent change.
