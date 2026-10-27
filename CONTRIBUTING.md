# Contributing

Follow the setup in README.md. Use Node 24+, Rust stable, and jj 0.46.0 for the
current verification baseline. Keep changes focused and describe user-visible
behavior, tests run, and any platform limitations in your pull request.

## Version control

This project primarily uses jj with a colocated Git repository. Clone with:

```sh
jj git clone --colocate https://github.com/zhm20001/jj-bond.git jj-bond
cd jj-bond
jj new
```

Use [GitHub Issues](https://github.com/zhm20001/jj-bond/issues) for bugs and maintainer contact.

Inspect changes with `jj status`, `git status --short` and `jj diff`.
Create commits with `jj commit -m "Short description"` when the working copy
contains only your change. If unrelated edits are present, use
`jj split <your-files…> -m "Short description"` to commit only your files.
Do not use `git add` or `git commit` in this colocated checkout. Use Git only
for read-only inspection and authorized remote synchronization. Never run
concurrent jj/Git history or index mutations. Pushing, publishing and rewriting
existing history require maintainer authorization.

Version policy and release gates are documented in
[the release checklist](docs/RELEASING.md).

## Validation

```sh
npm ci
npm run check
npm run test:rust -- --locked
```

For repository mutations, test against a temporary repository rather than your
working project. Integration tests must isolate user configuration, create their
own fixtures, and fail rather than silently skip missing prerequisites. Cover
behavior changes with regression tests. UI changes also need a manual desktop
check, including both languages and themes when relevant.

Keep translations in src/i18n.ts in sync. Keep frontend and Rust serialization
contracts aligned. When changing backend behavior, update the browser bridge or
explicitly document a desktop-only operation.

## Reports and contributions

For bugs, include OS, jj version, reproduction steps, expected/actual behavior,
and redacted error output. Do not include private repository contents or credentials.
Discuss substantial changes before implementation. Contributions are accepted
under the project's Apache-2.0 license unless explicitly agreed otherwise.
