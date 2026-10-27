# Open-source preparation implementation plan

Execution: subagent-driven-development, with the approved scope implemented in this session.

Goal: make the existing application understandable and reproducibly testable before publication.
Architecture: preserve React/Tauri and the development bridge; remove residue and improve test boundaries.
Tech stack: TypeScript, React, Vite, Rust, Tauri, jj.

- [x] Replace private-repository Rust tests in src-tauri/src/jj.rs with isolated temporary fixtures; run cargo test --locked --manifest-path src-tauri/Cargo.toml.
- [x] Test src/diffParse.ts and src/drag/curve.ts directly with Node 24 type stripping; expose npm test and npm run check.
- [x] Remove template SVGs and fallback demo paths; first launch stays empty until a repository is chosen. Validate npm run build.
- [x] Confirm drag helper authorship, remove _ref duplication, apply Apache-2.0 license and package metadata.
- [x] Rewrite README.md and add CONTRIBUTING.md, THIRD_PARTY_NOTICES.md, docs/RELEASING.md and macOS CI.
- [x] Review diff, run frontend and Rust checks, record limitations, verify jj status and commit history.
