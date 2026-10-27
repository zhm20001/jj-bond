//! Thin wrapper around the `jj` CLI. Parses `jj log` and invokes edit/new/rebase/undo/redo.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime};

/// One revision as returned by our fixed-field `jj log` template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub change_id: String,
    /// Length of `change_id.shortest()` — unique prefix in this repo (jj rules).
    pub unique_prefix_len: usize,
    pub commit_id: String,
    /// Length of `commit_id.shortest()` — unique prefix in this repo (jj rules).
    pub unique_commit_prefix_len: usize,
    pub is_working_copy: bool,
    pub immutable: bool,
    pub conflict: bool,
    pub parents: Vec<String>,
    pub bookmarks: Vec<String>,
    pub author: String,
    /// Committer timestamp (used for RecentRewrite sort).
    pub committer_ts: String,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct JjRepo {
    pub path: PathBuf,
}

impl JjRepo {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path
            .as_ref()
            .canonicalize()
            .with_context(|| format!("canonicalize repo path {}", path.as_ref().display()))?;
        let status = run_jj(&path, &["root"])?;
        if !status.status.success() {
            bail!(
                "not a jj repository at {}: {}",
                path.display(),
                String::from_utf8_lossy(&status.stderr)
            );
        }
        Ok(Self { path })
    }

    pub fn path_display(&self) -> String {
        self.path.display().to_string()
    }

    /// One `jj log` invocation with the ASCII graph enabled. The graph walk
    /// keeps first-parent stacks contiguous (`--no-graph` order interleaves
    /// other heads between a child and its parent), so row order equals the
    /// drawing order of this single run.
    pub fn log(&self, revset: Option<&str>) -> Result<Vec<Revision>> {
        let rev = normalize_revset(revset);
        let template = concat!(
            r#"change_id ++ "\t" ++ "#,
            r#"change_id.shortest() ++ "\t" ++ "#,
            r#"commit_id ++ "\t" ++ "#,
            r#"commit_id.shortest() ++ "\t" ++ "#,
            r#"if(current_working_copy, "1", "0") ++ "\t" ++ "#,
            r#"if(immutable, "1", "0") ++ "\t" ++ "#,
            r#"if(conflict, "1", "0") ++ "\t" ++ "#,
            r#"parents.map(|c| c.change_id()).join(",") ++ "\t" ++ "#,
            r#"bookmarks.map(|b| b.name()).join(",") ++ "\t" ++ "#,
            r#"author.name() ++ "\t" ++ "#,
            r#"committer.timestamp().format("%Y-%m-%dT%H:%M:%S") ++ "\t" ++ "#,
            r#"description.first_line().escape_json() ++ "\n""#
        );
        let out = run_jj(
            &self.path,
            &["log", "--ignore-working-copy", "-r", &rev, "-T", template],
        )?;
        if !out.status.success() {
            bail!(
                "jj log failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let mut revs = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for line in stdout.lines() {
            // The template emits exactly one tab-separated line per commit
            // after the graph prefix; pure-glyph rows (`⋮`/`~` elision) have
            // no template output and are skipped.
            let Some(fields) = strip_graph_prefix(line) else {
                continue;
            };
            let rev = parse_rev_line(fields)?;
            if seen.insert(rev.change_id.clone()) {
                revs.push(rev);
            }
        }
        Ok(revs)
    }

    pub fn edit(&self, change_id: &str) -> Result<String> {
        let out = run_jj(&self.path, &["edit", "-r", change_id])?;
        result_message("edit", out)
    }

    pub fn new_child(&self, change_id: &str) -> Result<String> {
        let out = run_jj(&self.path, &["new", "-r", change_id])?;
        result_message("new", out)
    }

    /// Pruning rebase (`jj rebase -r`): move only these revisions; external
    /// descendants are reparented (GG MoveRevisions / 剪枝).
    pub fn rebase_revisions(&self, revisions: &[String], destination: &str) -> Result<String> {
        if revisions.is_empty() {
            bail!("rebase requires at least one revision");
        }
        let revset = revisions.join("|");
        let out = run_jj(&self.path, &["rebase", "-r", &revset, "-d", destination])?;
        result_message("rebase", out)
    }

    pub fn rebase_stack(&self, source: &str, destination: &str) -> Result<String> {
        let out = run_jj(&self.path, &["rebase", "-s", source, "-d", destination])?;
        result_message("rebase", out)
    }

    pub fn undo(&self) -> Result<String> {
        let out = run_jj(&self.path, &["undo"])?;
        result_message("undo", out)
    }

    pub fn redo(&self) -> Result<String> {
        let out = run_jj(&self.path, &["redo"])?;
        result_message("redo", out)
    }

    /// Create a new empty change. `mode`: "child" (parents = revisions) or
    /// "insertBefore" (`--insert-before` oldest / first in list for GG: caller
    /// should pass oldest-first for insertBefore — we use revisions[0] as the
    /// insert-before target; for child, all revisions become parents).
    pub fn new_revisions(&self, revisions: &[String], mode: &str) -> Result<String> {
        if revisions.is_empty() {
            bail!("new requires at least one revision");
        }
        let mut args: Vec<String> = vec!["new".into(), "--no-edit".into()];
        match mode {
            "insertBefore" => {
                // GG: insert before oldest selected.
                args.push("--insert-before".into());
                args.push(revisions[0].clone());
            }
            "child" => {
                for r in revisions {
                    args.push(r.clone());
                }
            }
            other => bail!("unknown new mode: {other}"),
        }
        let out = run_jj_owned(&self.path, &args)?;
        result_message("new", out)
    }

    pub fn abandon(&self, revisions: &[String]) -> Result<String> {
        if revisions.is_empty() {
            bail!("abandon requires at least one revision");
        }
        let mut args: Vec<String> = vec!["abandon".into()];
        args.extend(revisions.iter().cloned());
        let out = run_jj_owned(&self.path, &args)?;
        result_message("abandon", out)
    }

    /// Singleton: `jj squash -r ID`. Multi: `jj squash --from ID… --into INTO`.
    pub fn squash_revisions(&self, revisions: &[String], into: Option<&str>) -> Result<String> {
        if revisions.is_empty() {
            bail!("squash requires at least one revision");
        }
        let mut args: Vec<String> = vec!["squash".into()];
        if let Some(dest) = into {
            for r in revisions {
                args.push("--from".into());
                args.push(r.clone());
            }
            args.push("--into".into());
            args.push(dest.to_string());
        } else {
            if revisions.len() != 1 {
                bail!("multi-revision squash requires --into parent");
            }
            args.push("-r".into());
            args.push(revisions[0].clone());
        }
        let out = run_jj_owned(&self.path, &args)?;
        result_message("squash", out)
    }

    pub fn restore_from_parent(&self, revisions: &[String], parent: &str) -> Result<String> {
        if revisions.is_empty() {
            bail!("restore requires at least one revision");
        }
        let into = revisions.join("|");
        let out = run_jj(&self.path, &["restore", "--from", parent, "--into", &into])?;
        result_message("restore", out)
    }

    pub fn duplicate(&self, revisions: &[String]) -> Result<String> {
        if revisions.is_empty() {
            bail!("duplicate requires at least one revision");
        }
        let mut args: Vec<String> = vec!["duplicate".into()];
        args.extend(revisions.iter().cloned());
        let out = run_jj_owned(&self.path, &args)?;
        result_message("duplicate", out)
    }

    pub fn revert_onto_wc(&self, revisions: &[String]) -> Result<String> {
        if revisions.is_empty() {
            bail!("revert requires at least one revision");
        }
        let mut args: Vec<String> = vec!["revert".into()];
        for r in revisions {
            args.push("-r".into());
            args.push(r.clone());
        }
        args.push("--onto".into());
        args.push("@".into());
        let out = run_jj_owned(&self.path, &args)?;
        result_message("revert", out)
    }

    pub fn bookmark_create(&self, name: &str, revision: &str) -> Result<String> {
        if name.trim().is_empty() {
            bail!("bookmark name required");
        }
        let out = run_jj(&self.path, &["bookmark", "create", name, "-r", revision])?;
        result_message("bookmark create", out)
    }

    /// Move an existing bookmark to `revision` (`jj bookmark move NAME -t REV`).
    pub fn bookmark_move(&self, name: &str, revision: &str) -> Result<String> {
        if name.trim().is_empty() {
            bail!("bookmark name required");
        }
        // UI "move here" is intentional; allow sideways/backwards moves.
        let out = run_jj(
            &self.path,
            &[
                "bookmark",
                "move",
                name,
                "-t",
                revision,
                "--allow-backwards",
            ],
        )?;
        result_message("bookmark move", out)
    }

    pub fn bookmark_rename(&self, old: &str, new: &str) -> Result<String> {
        if old.trim().is_empty() || new.trim().is_empty() {
            bail!("old and new bookmark names required");
        }
        let out = run_jj(&self.path, &["bookmark", "rename", old, new])?;
        result_message("bookmark rename", out)
    }

    pub fn bookmark_delete(&self, name: &str) -> Result<String> {
        if name.trim().is_empty() {
            bail!("bookmark name required");
        }
        let out = run_jj(&self.path, &["bookmark", "delete", name])?;
        result_message("bookmark delete", out)
    }

    pub fn describe_revision(&self, revision: &str, message: &str) -> Result<String> {
        let out = run_jj(&self.path, &["describe", "-r", revision, "-m", message])?;
        result_message("describe", out)
    }

    pub fn diff_stat(
        &self,
        change_id: &str,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<crate::detail::DiffStat> {
        let args = diff_range_args(change_id, from, to, &["--stat", "--ignore-working-copy"]);
        let out = run_jj_owned(&self.path, &args)?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        if !out.status.success() && stdout.trim().is_empty() {
            anyhow::bail!("jj diff --stat failed: {}", stderr.trim());
        }
        Ok(crate::detail::parse_diff_stat(&stdout))
    }

    /// Per-file status + ± for a revision (`jj diff --summary` + `--stat`).
    /// When `from`/`to` are set, compares that range instead of `-r change_id`.
    pub fn diff_files(
        &self,
        change_id: &str,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<crate::detail::DiffFilesResult> {
        let summary_args =
            diff_range_args(change_id, from, to, &["--summary", "--ignore-working-copy"]);
        let summary_out = run_jj_owned(&self.path, &summary_args)?;
        let summary_stdout = String::from_utf8_lossy(&summary_out.stdout);
        let summary_stderr = String::from_utf8_lossy(&summary_out.stderr);
        if !summary_out.status.success() && summary_stdout.trim().is_empty() {
            anyhow::bail!("jj diff --summary failed: {}", summary_stderr.trim());
        }

        let stat_args = diff_range_args(change_id, from, to, &["--stat", "--ignore-working-copy"]);
        let stat_out = run_jj_owned(&self.path, &stat_args)?;
        let stat_stdout = String::from_utf8_lossy(&stat_out.stdout);
        if !stat_out.status.success() {
            bail!(
                "jj diff --stat failed: {}",
                String::from_utf8_lossy(&stat_out.stderr).trim()
            );
        }
        let summary = crate::detail::parse_diff_summary(&summary_stdout);
        let stats = crate::detail::parse_diff_stat_files(&stat_stdout);
        Ok(crate::detail::DiffFilesResult {
            files: crate::detail::merge_diff_files(&summary, &stats),
            stat: crate::detail::parse_diff_stat(&stat_stdout),
        })
    }

    /// Unified diff text for one file in a revision (or from→to range).
    pub fn diff_file(
        &self,
        change_id: &str,
        file_path: &str,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<String> {
        if file_path.trim().is_empty() {
            bail!("file path required");
        }
        let mut args = diff_range_args(change_id, from, to, &["--git", "--ignore-working-copy"]);
        args.push("--".into());
        args.push(file_path.into());
        let out = run_jj_owned(&self.path, &args)?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        if !out.status.success() && stdout.trim().is_empty() {
            anyhow::bail!("jj diff file failed: {}", stderr.trim());
        }
        Ok(stdout.into_owned())
    }

    /// List conflicted paths for a revision (`jj resolve --list -r`).
    pub fn list_conflicts(&self, change_id: &str) -> Result<Vec<ConflictEntry>> {
        let out = run_jj(&self.path, &["resolve", "--list", "-r", change_id])?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        if !out.status.success() {
            // Non-conflicted revisions may still succeed with empty stdout;
            // only fail hard when stderr indicates a real error and stdout empty.
            if stdout.trim().is_empty() && !stderr.trim().is_empty() {
                anyhow::bail!("jj resolve --list failed: {}", stderr.trim());
            }
        }
        Ok(parse_resolve_list(&stdout))
    }

    /// Resolve one conflicted path with a built-in tool (`:ours` / `:theirs`).
    pub fn resolve_conflict(&self, revision: &str, file_path: &str, tool: &str) -> Result<String> {
        if file_path.trim().is_empty() {
            bail!("file path required");
        }
        let tool_arg = match tool {
            "ours" => ":ours",
            "theirs" => ":theirs",
            other => bail!("unknown resolve tool: {other} (use ours|theirs)"),
        };
        let out = run_jj(
            &self.path,
            &[
                "resolve", "-r", revision, "--tool", tool_arg, "--", file_path,
            ],
        )?;
        // Prefer a short human message over raw jj stderr dumps.
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            bail!("resolve failed: {stderr}");
        }
        Ok(format!("resolved {file_path} with {tool}"))
    }
}

/// One conflicted path from `jj resolve --list`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictEntry {
    pub path: String,
    pub detail: String,
}

/// PATH used for every jj spawn, computed once per process. GUI launches
/// (Finder/Dock) don't inherit the user's shell PATH, so Homebrew, cargo or
/// mise installs of jj would not be found; ask the login shell for its PATH
/// and merge it with the inherited one (JayJay-style resolution).
fn jj_spawn_path() -> OsString {
    static SPAWN_PATH: OnceLock<OsString> = OnceLock::new();
    SPAWN_PATH
        .get_or_init(|| {
            let home = std::env::var_os("HOME")
                .filter(|h| !h.is_empty())
                .map(PathBuf::from);
            merged_path_entries(
                login_shell_path().as_deref(),
                std::env::var("PATH").ok().as_deref(),
                home.as_deref(),
            )
        })
        .clone()
}

/// Merge PATH sources: login-shell PATH first, inherited PATH second, then
/// user-local and system install dirs. Entries are deduplicated and relative
/// entries are dropped so a repo-local `jj` (via `.` or `bin` components)
/// cannot shadow a system binary.
fn merged_path_entries(
    login: Option<&str>,
    inherited: Option<&str>,
    home: Option<&Path>,
) -> OsString {
    let mut entries: Vec<PathBuf> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push = |entry: PathBuf| {
        if entry.is_absolute() && seen.insert(entry.clone()) {
            entries.push(entry);
        }
    };
    for path_value in [login, inherited].into_iter().flatten() {
        for entry in std::env::split_paths(path_value) {
            push(entry);
        }
    }
    if let Some(home) = home {
        push(home.join(".local").join("bin"));
        push(home.join(".cargo").join("bin"));
    }
    for entry in system_path_entries() {
        push(entry);
    }
    // join_paths only fails when an entry embeds the platform separator;
    // entries produced by split_paths/join cannot.
    std::env::join_paths(entries).expect("PATH entries contain no separator")
}

/// System-wide install dirs appended last; inherited entries keep priority.
#[cfg(unix)]
fn system_path_entries() -> Vec<PathBuf> {
    [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect()
}

#[cfg(not(unix))]
fn system_path_entries() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(unix)]
const LOGIN_PATH_TIMEOUT: Duration = Duration::from_secs(2);

/// The user's login-shell PATH, resolved once and bounded by a timeout.
/// `zsh -l`/`bash -l` source the profile files that set up Homebrew, mise or
/// nix; fish needs its own join syntax. A shell that hangs or prints nothing
/// yields `None`, and callers fall back to the other PATH sources.
#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    static LOGIN_PATH: OnceLock<Option<String>> = OnceLock::new();
    LOGIN_PATH
        .get_or_init(|| {
            let shell = std::env::var("SHELL")
                .ok()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "/bin/zsh".to_string());
            let print_path = if shell.ends_with("fish") {
                "string join : -- $PATH"
            } else {
                r#"printf %s "$PATH""#
            };
            let stdout = wait_with_timeout(
                Command::new(&shell)
                    .args(["-l", "-c", print_path])
                    .stdin(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null()),
                LOGIN_PATH_TIMEOUT,
            )?;
            let path = String::from_utf8_lossy(&stdout).trim().to_string();
            (!path.is_empty()).then_some(path)
        })
        .clone()
}

#[cfg(not(unix))]
fn login_shell_path() -> Option<String> {
    None
}

/// Capture a Unix shell probe within one deadline for both exit and stdout.
/// A nonblocking socket avoids waiting for EOF from inherited descriptors in
/// background descendants, without leaving a blocked reader thread behind.
/// Failed, oversized (>1 MiB), or incomplete probes return None for fallback.
#[cfg(unix)]
fn wait_with_timeout(command: &mut Command, timeout: Duration) -> Option<Vec<u8>> {
    use std::io::{ErrorKind, Read};
    use std::os::fd::OwnedFd;
    use std::os::unix::net::UnixStream;

    let deadline = Instant::now() + timeout;
    let (mut reader, writer) = UnixStream::pair().ok()?;
    reader.set_nonblocking(true).ok()?;
    command.stdout(std::process::Stdio::from(OwnedFd::from(writer)));
    let mut child = command.spawn().ok()?;
    // Command retains its configured descriptor after spawn; release that copy
    // so EOF depends only on the child and any descendants.
    command.stdout(std::process::Stdio::null());
    let mut status = None;
    let result = (|| {
        let mut output = Vec::new();
        let mut eof = false;
        let mut buffer = [0u8; 8192];
        loop {
            if Instant::now() >= deadline {
                return None;
            }
            if status.is_none() {
                status = child.try_wait().ok()?;
            }
            if status.is_some_and(|s| !s.success()) {
                return None;
            }
            match reader.read(&mut buffer) {
                Ok(0) => eof = true,
                Ok(n) => {
                    if output.len() + n > 1024 * 1024 {
                        return None;
                    }
                    output.extend_from_slice(&buffer[..n]);
                    continue;
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                Err(_) => return None,
            }
            if eof && status.is_some() {
                return Some(output);
            }
            std::thread::sleep(
                Duration::from_millis(5).min(deadline.saturating_duration_since(Instant::now())),
            );
        }
    })();
    if status.is_none() {
        // Best effort cleanup of a discarded probe; the child may have exited
        // between polling and kill. No repository operation depends on it.
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}

fn run_jj(repo: &Path, args: &[&str]) -> Result<Output> {
    let mut command = Command::new("jj");
    command.env("PATH", jj_spawn_path());
    // Match fixture setup without mutating the process environment in parallel tests.
    // Desktop builds continue to honor the user's jj configuration.
    #[cfg(test)]
    command.env("JJ_CONFIG", "");
    let subcmd = args.first().copied().unwrap_or("");
    command
        .arg("-R")
        .arg(repo)
        .args(args)
        .current_dir(repo)
        .output()
        .map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                anyhow!("jj `{subcmd}`: jj executable not found — install jj and make sure it is reachable via PATH ({err})")
            } else {
                anyhow!("jj `{subcmd}` failed to start: {err}")
            }
        })
}

fn run_jj_owned(repo: &Path, args: &[String]) -> Result<Output> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_jj(repo, &refs)
}

fn result_message(op: &str, out: Output) -> Result<String> {
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() {
        bail!("{op} failed: {stderr}");
    }
    Ok(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("{op} ok")
    })
}

/// Empty / whitespace revset → `all()`.
pub fn normalize_revset(revset: Option<&str>) -> String {
    match revset {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => "all()".to_string(),
    }
}

/// Build `jj diff` argv: either `-r CHANGE` or `--from`/`--to` when both set.
fn diff_range_args(
    change_id: &str,
    from: Option<&str>,
    to: Option<&str>,
    extra: &[&str],
) -> Vec<String> {
    let mut args = vec!["diff".to_string()];
    match (from, to) {
        (Some(f), Some(t)) if !f.is_empty() && !t.is_empty() => {
            args.push("--from".into());
            args.push(f.into());
            args.push("--to".into());
            args.push(t.into());
        }
        _ => {
            args.push("-r".into());
            args.push(change_id.into());
        }
    }
    for e in extra {
        args.push((*e).into());
    }
    args
}

/// Strip jj ASCII-graph prefixes (`@`, `○`, `│`, …) and return the change id token.
pub fn extract_change_id_from_graph_line(line: &str) -> Option<&str> {
    let rest = strip_graph_prefix(line)?;
    let id = rest.split_whitespace().next()?;
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

/// Tab-separated template fields following the ASCII-graph prefix, or `None`
/// for pure-glyph rows (elision `⋮` / `~`) that carry no template output.
/// The prefix consists solely of non-alphanumeric glyphs and padding spaces;
/// template output always starts with the (alphanumeric) change id.
fn strip_graph_prefix(line: &str) -> Option<&str> {
    let rest = line.trim_start_matches(|c: char| !c.is_ascii_alphanumeric());
    if rest.is_empty() {
        None
    } else {
        Some(rest)
    }
}

pub fn parse_rev_line(line: &str) -> Result<Revision> {
    let parts: Vec<&str> = line.split('\t').collect();
    if parts.len() < 12 {
        bail!("bad log line ({} fields): {line}", parts.len());
    }
    let unique_prefix_len = parts[1].chars().count().max(1);
    let unique_commit_prefix_len = parts[3].chars().count().max(1);
    let desc_raw = parts[11..].join("\t");
    let description = serde_json::from_str::<String>(&desc_raw)
        .unwrap_or_else(|_| desc_raw.trim_matches('"').to_string());
    let parents = if parts[7].is_empty() {
        Vec::new()
    } else {
        parts[7].split(',').map(|s| s.to_string()).collect()
    };
    let bookmarks = if parts[8].is_empty() {
        Vec::new()
    } else {
        parts[8].split(',').map(|s| s.to_string()).collect()
    };
    Ok(Revision {
        change_id: parts[0].to_string(),
        unique_prefix_len,
        commit_id: parts[2].to_string(),
        unique_commit_prefix_len,
        is_working_copy: parts[4] == "1",
        immutable: parts[5] == "1",
        conflict: parts[6] == "1",
        parents,
        bookmarks,
        author: parts[9].to_string(),
        committer_ts: parts[10].to_string(),
        description,
    })
}

/// Parse stdout of `jj resolve --list`.
pub fn parse_resolve_list(stdout: &str) -> Vec<ConflictEntry> {
    stdout.lines().filter_map(parse_resolve_list_line).collect()
}

/// One line: `path<whitespace>detail` (jj aligns with spaces; may use tab).
pub fn parse_resolve_list_line(line: &str) -> Option<ConflictEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    if let Some((path, detail)) = line.split_once('\t') {
        let path = path.trim();
        if path.is_empty() {
            return None;
        }
        return Some(ConflictEntry {
            path: path.to_string(),
            detail: detail.trim().to_string(),
        });
    }
    if let Some(idx) = line.find("  ") {
        let path = line[..idx].trim();
        let detail = line[idx..].trim();
        if path.is_empty() {
            return None;
        }
        return Some(ConflictEntry {
            path: path.to_string(),
            detail: detail.to_string(),
        });
    }
    Some(ConflictEntry {
        path: line.to_string(),
        detail: String::new(),
    })
}

/// Split a display change-id into unique prefix + muted remainder (GG IdSpan style).
pub fn split_change_id_prefix(change_id: &str, unique_prefix_len: usize) -> (&str, &str) {
    let n = unique_prefix_len.min(change_id.chars().count()).max(1);
    // change ids are ASCII hex-like; byte index == char index
    let n = n.min(change_id.len());
    change_id.split_at(n)
}

pub fn parse_ts_key(ts: &str) -> u64 {
    if ts.len() >= 19 {
        let digits: String = ts.chars().filter(|c| c.is_ascii_digit()).collect();
        return digits.parse::<u64>().unwrap_or(0);
    }
    SystemTime::UNIX_EPOCH
        .elapsed()
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn short_id(id: &str) -> &str {
    id.get(..8).unwrap_or(id)
}

#[cfg(test)]
mod test_repo {
    use super::JjRepo;
    use std::{
        fs,
        path::PathBuf,
        process::Command,
        sync::atomic::{AtomicU64, Ordering},
    };

    static NEXT_ID: AtomicU64 = AtomicU64::new(0);

    /// Every integration test owns its repository and removes it on completion.
    pub struct TestRepo {
        pub path: PathBuf,
    }

    impl TestRepo {
        pub fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "jj-bond-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed),
            ));
            fs::create_dir(&path).unwrap();
            let fixture = Self { path };
            fixture.jj(&["git", "init", "--colocate"]);
            fs::write(
                fixture.path.join(".jj/repo/config.toml"),
                concat!(
                    "[user]\nname = 'Test User'\nemail = 'test@example.invalid'\n",
                    "[signing]\nbehavior = 'drop'\n",
                    "[ui]\ncolor = 'never'\npaginate = 'never'\n",
                ),
            )
            .unwrap();
            fixture
        }

        pub fn linear() -> Self {
            let fixture = Self::new();
            fixture.jj(&["describe", "-m", "base"]);
            fixture.jj(&["bookmark", "create", "base"]);
            fixture.jj(&["new", "-m", "parent"]);
            fixture.jj(&["bookmark", "create", "parent"]);
            fixture.jj(&["new", "-m", "child"]);
            fixture
        }

        pub fn jj(&self, args: &[&str]) -> String {
            let output = Command::new("jj")
                .env("JJ_CONFIG", "")
                .args(args)
                .current_dir(&self.path)
                .output()
                .expect("jj must be installed on PATH");
            assert!(
                output.status.success(),
                "jj {args:?}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8(output.stdout).unwrap().trim().to_owned()
        }

        pub fn repo(&self) -> JjRepo {
            JjRepo::open(&self.path).expect("open temporary repository")
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn shell_probe_times_out_when_descendant_holds_stdout() {
        let start = Instant::now();
        let output = wait_with_timeout(
            Command::new("/bin/sh").args(["-c", "sleep 1 & printf /usr/bin"]),
            Duration::from_millis(100),
        );
        assert!(
            start.elapsed() < Duration::from_millis(750),
            "stdout bypassed deadline"
        );
        assert!(output.is_none(), "incomplete probe must fall back");
    }

    #[cfg(unix)]
    #[test]
    fn shell_probe_drains_output_while_child_runs() {
        let output = wait_with_timeout(
            Command::new("/bin/sh").args(["-c", "head -c 262144 /dev/zero"]),
            Duration::from_secs(2),
        )
        .expect("drain more output than the socket buffer can hold");
        assert_eq!(output, vec![0; 262144]);
    }

    #[cfg(unix)]
    #[test]
    fn shell_probe_handles_success_failure_and_live_timeout() {
        let output = wait_with_timeout(
            Command::new("/bin/sh").args(["-c", "printf /usr/bin"]),
            Duration::from_secs(1),
        );
        assert_eq!(output.as_deref(), Some(b"/usr/bin".as_slice()));
        assert!(wait_with_timeout(
            Command::new("/bin/sh").args(["-c", "printf partial; exit 1"]),
            Duration::from_secs(1),
        )
        .is_none());
        let start = Instant::now();
        assert!(wait_with_timeout(
            Command::new("/bin/sh").args(["-c", "exec sleep 1"]),
            Duration::from_millis(100),
        )
        .is_none());
        assert!(start.elapsed() < Duration::from_millis(750));
    }

    #[test]
    fn diff_files_preserves_large_totals() {
        let fixture = super::test_repo::TestRepo::new();
        let content = "added line\n".repeat(1000);
        std::fs::write(fixture.path.join("large.txt"), content).expect("write large file");
        fixture.jj(&["status"]);
        let result = fixture
            .repo()
            .diff_files("@", None, None)
            .expect("diff files");
        let value = serde_json::to_value(result).expect("serialize diff response");
        assert_eq!(value["stat"]["insertions"], 1000);
        assert_eq!(value["stat"]["deletions"], 0);
    }

    #[test]
    fn graph_order_keeps_child_adjacent_to_parent() {
        let fixture = super::test_repo::TestRepo::linear();
        let child = fixture.jj(&["log", "--no-graph", "-r", "@", "-T", "change_id"]);
        fixture.jj(&["new", "base", "-m", "side branch"]);
        fixture.jj(&["edit", &child]);
        let revs = fixture.repo().log(None).expect("log");
        let pr = revs
            .iter()
            .position(|r| r.change_id == child)
            .expect("child");
        let yw = revs
            .iter()
            .position(|r| r.description == "parent")
            .expect("parent");
        assert_eq!(pr + 1, yw, "child and parent should be adjacent");
        assert_eq!(
            revs[pr].parents.first().map(String::as_str),
            Some(revs[yw].change_id.as_str())
        );
    }

    #[test]
    fn extract_id_from_graph_line_strips_prefix() {
        assert_eq!(
            extract_change_id_from_graph_line("│ ○  prrzrmnxabc"),
            Some("prrzrmnxabc")
        );
        assert_eq!(
            extract_change_id_from_graph_line("@  ytwvvqrtxyz"),
            Some("ytwvvqrtxyz")
        );
    }

    #[cfg(unix)]
    #[test]
    fn merged_path_entries_merges_dedupes_and_drops_relative() {
        let path = merged_path_entries(
            Some("/opt/homebrew/bin:bin"),
            Some("/usr/bin:.:/opt/homebrew/bin"),
            Some(Path::new("/Users/alice")),
        );
        let entries: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert_eq!(entries.first(), Some(&PathBuf::from("/opt/homebrew/bin")));
        assert!(entries.contains(&PathBuf::from("/usr/bin")));
        assert!(entries.contains(&PathBuf::from("/Users/alice/.local/bin")));
        assert!(entries.contains(&PathBuf::from("/Users/alice/.cargo/bin")));
        assert_eq!(
            entries
                .iter()
                .filter(|p| p.as_path() == Path::new("/opt/homebrew/bin"))
                .count(),
            1
        );
        assert!(entries.iter().all(|p| p.is_absolute()));
        // System dirs are appended last as a fallback.
        assert_eq!(entries.last(), Some(&PathBuf::from("/sbin")));
    }

    #[cfg(unix)]
    #[test]
    fn merged_path_entries_survives_missing_sources() {
        let path = merged_path_entries(None, None, None);
        let entries: Vec<PathBuf> = std::env::split_paths(&path).collect();
        assert!(!entries.is_empty());
        assert!(entries.iter().all(|p| p.is_absolute()));
    }

    /// Regression for Finder/Dock launches: the app process only has the
    /// system-default PATH, where `Command::new("jj")` used to fail with a
    /// bare "spawn jj root". Re-exec this test binary with a GUI-style
    /// minimal PATH and verify `run_jj` still finds jj via the merged PATH.
    #[cfg(unix)]
    #[test]
    fn run_jj_spawns_jj_with_gui_style_minimal_path() {
        const CHILD_MODE: &str = "JJ_BOND_CHILD_MINIMAL_PATH";
        if std::env::var_os(CHILD_MODE).is_some() {
            // `--exact` below runs only this test in the child, so narrowing
            // the process PATH here cannot disturb parallel fixtures.
            let fixture = super::test_repo::TestRepo::new();
            std::env::set_var("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
            let repo = fixture.repo(); // JjRepo::open → run_jj(["root"])
            assert!(
                !repo.log(None).expect("log via merged PATH").is_empty(),
                "run_jj must resolve jj outside the inherited PATH"
            );
            println!("JJ_BOND_MINIMAL_PATH_VERIFIED");
            return;
        }
        let exe = std::env::current_exe().expect("current test binary");
        // libtest names omit the crate prefix returned by module_path!().
        let full_name = concat!(
            module_path!(),
            "::run_jj_spawns_jj_with_gui_style_minimal_path"
        );
        let (_, test_name) = full_name
            .split_once("::")
            .expect("module path includes crate name");
        let output = Command::new(exe)
            .arg(test_name)
            .arg("--exact")
            .arg("--nocapture")
            .env(CHILD_MODE, "1")
            .output()
            .expect("re-exec test binary");
        assert!(
            output.status.success(),
            "child with a GUI-style minimal PATH must still spawn jj: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            String::from_utf8_lossy(&output.stdout).contains("JJ_BOND_MINIMAL_PATH_VERIFIED"),
            "child must execute the PATH check, not merely exit successfully: {}",
            String::from_utf8_lossy(&output.stdout)
        );
    }

    #[test]
    fn strip_graph_prefix_skips_elision_rows() {
        // Pure-glyph rows emitted by graph log for elided portions.
        assert_eq!(strip_graph_prefix("⋮"), None);
        assert_eq!(strip_graph_prefix("~"), None);
        assert_eq!(strip_graph_prefix("│   "), None);
        assert_eq!(strip_graph_prefix(""), None);
        assert_eq!(
            strip_graph_prefix("├─╯  kspmzktp\tkspm\ta6a4\t1"),
            Some("kspmzktp\tkspm\ta6a4\t1")
        );
    }

    #[test]
    fn parse_graph_prefixed_log_line() {
        let line = "@  qqmkzoxqznys\tq\t734498b2\t73\t1\t0\t1\tynxwomwoynyn\t\t\t2026-10-25T20:53:15\t\"side edits file\"";
        let fields = strip_graph_prefix(line).expect("fields after graph prefix");
        let r = parse_rev_line(fields).unwrap();
        assert!(r.is_working_copy);
        assert!(r.conflict);
        assert_eq!(r.change_id, "qqmkzoxqznys");
        assert_eq!(r.description, "side edits file");
    }

    #[test]
    fn log_with_limited_revset_skips_elision_rows() {
        let fixture = super::test_repo::TestRepo::linear();
        fixture.jj(&["new", "-m", "top"]);
        let repo = fixture.repo();
        // heads() leaves the linear ancestors elided; graph log emits `⋮`/`~`
        // rows that must be skipped without a parse error.
        let revs = repo.log(Some("heads(all())")).expect("log");
        assert!(!revs.is_empty(), "head revision missing");
        assert!(revs.iter().all(|r| !r.change_id.is_empty()));
        assert!(
            revs.iter().any(|r| r.is_working_copy),
            "expected the working-copy head, got {} revisions",
            revs.len()
        );
    }

    #[test]
    fn parse_line_with_bookmark() {
        let line = "kspmzktpvmyu\tkspm\ta6a48c93\ta6a4\t0\t0\t0\truysxtyyroko\tfeature-b\t\t2026-10-25T17:54:25\t\"add feature B\"";
        let r = parse_rev_line(line).unwrap();
        assert_eq!(r.change_id, "kspmzktpvmyu");
        assert_eq!(r.unique_prefix_len, 4);
        assert_eq!(r.unique_commit_prefix_len, 4);
        assert_eq!(r.commit_id, "a6a48c93");
        assert_eq!(r.bookmarks, vec!["feature-b"]);
        assert_eq!(r.description, "add feature B");
        assert!(!r.is_working_copy);
        assert!(!r.conflict);
        let (pre, rest) = split_change_id_prefix(&r.change_id, r.unique_prefix_len);
        assert_eq!(pre, "kspm");
        assert_eq!(rest, "zktpvmyu");
    }

    #[test]
    fn parse_line_with_conflict_flag() {
        let line = "qqmkzoxqznys\tq\t734498b2\t73\t1\t0\t1\tynxwomwoynyn\t\t\t2026-10-25T20:53:15\t\"side edits file\"";
        let r = parse_rev_line(line).unwrap();
        assert!(r.conflict);
        assert!(r.is_working_copy);
        assert_eq!(r.description, "side edits file");
    }

    #[test]
    fn parse_resolve_list_spaces() {
        let entries =
            parse_resolve_list("file.txt    2-sided conflict\nother.txt\t3-sided conflict\n");
        assert_eq!(
            entries,
            vec![
                ConflictEntry {
                    path: "file.txt".into(),
                    detail: "2-sided conflict".into(),
                },
                ConflictEntry {
                    path: "other.txt".into(),
                    detail: "3-sided conflict".into(),
                },
            ]
        );
    }

    #[test]
    fn merge_conflict_marks_working_copy() {
        let fixture = super::test_repo::TestRepo::new();
        std::fs::write(fixture.path.join("file.txt"), "base\n").unwrap();
        fixture.jj(&["describe", "-m", "base"]);
        fixture.jj(&["bookmark", "create", "base"]);
        fixture.jj(&["new", "-m", "left"]);
        std::fs::write(fixture.path.join("file.txt"), "left\n").unwrap();
        fixture.jj(&["bookmark", "create", "left"]);
        fixture.jj(&["new", "base", "-m", "right"]);
        std::fs::write(fixture.path.join("file.txt"), "right\n").unwrap();
        fixture.jj(&["bookmark", "create", "right"]);
        fixture.jj(&["new", "left", "right", "-m", "merge"]);
        let repo = fixture.repo();
        let revs = repo.log(None).expect("log");
        let wc = revs.iter().find(|r| r.is_working_copy).expect("wc");
        assert!(wc.conflict, "merged working copy should be conflicted");
        let entries = repo.list_conflicts(&wc.change_id).expect("list");
        assert!(
            entries
                .iter()
                .any(|e| e.path == "file.txt" || e.path.ends_with("/file.txt")),
            "expected file.txt in conflicts: {entries:?}"
        );
    }

    #[test]
    fn log_includes_unique_prefix_len_from_jj_shortest() {
        let fixture = super::test_repo::TestRepo::linear();
        let repo = fixture.repo();
        let revs = repo.log(None).expect("log");
        assert!(revs.iter().all(|r| r.unique_prefix_len >= 1));
        assert!(revs.iter().any(|r| r.unique_prefix_len < r.change_id.len()));
    }

    #[test]
    fn opens_temporary_repo_and_logs() {
        let fixture = super::test_repo::TestRepo::linear();
        let repo = fixture.repo();
        let revs = repo.log(None).expect("log");
        assert!(revs.len() >= 3, "expected several revs, got {}", revs.len());
        assert!(revs.iter().any(|r| r.is_working_copy), "missing WC");
        assert!(
            revs.iter().any(|r| !r.bookmarks.is_empty()),
            "missing bookmarks"
        );
        let layout =
            crate::graph::GraphLayout::build(revs, crate::prefs::SortMode::WorkingCopyFirst);
        assert!(!layout.nodes.is_empty());
        assert!(layout.lane_count >= 1);
        assert!(!layout.edges.is_empty());
    }
}

#[cfg(test)]
mod sort_tests {
    #[test]
    fn recent_rewrite_keeps_wc_near_top() {
        let fixture = super::test_repo::TestRepo::linear();
        let repo = fixture.repo();
        let revs = repo.log(None).unwrap();
        let layout = crate::graph::GraphLayout::build(revs, crate::prefs::SortMode::RecentRewrite);
        let wc_row = layout
            .nodes
            .iter()
            .position(|n| n.rev.is_working_copy)
            .unwrap();
        assert!(
            wc_row <= 1,
            "WC should be near top in RecentRewrite, row={wc_row}"
        );
    }
}

#[cfg(test)]
mod growth_tests {
    use crate::graph::{row_top_y, visual_row};
    use crate::prefs::GrowthDirection;

    #[test]
    fn bottom_up_keeps_row0_at_top() {
        assert_eq!(visual_row(0, 5, GrowthDirection::BottomUp), 0);
        assert_eq!(visual_row(4, 5, GrowthDirection::BottomUp), 4);
        let y0 = row_top_y(0, 5, GrowthDirection::BottomUp, 10.0, 20.0);
        let y4 = row_top_y(4, 5, GrowthDirection::BottomUp, 10.0, 20.0);
        assert!(y0 < y4);
    }

    #[test]
    fn top_down_flips_visual_rows() {
        assert_eq!(visual_row(0, 5, GrowthDirection::TopDown), 4);
        assert_eq!(visual_row(4, 5, GrowthDirection::TopDown), 0);
        let y0 = row_top_y(0, 5, GrowthDirection::TopDown, 10.0, 20.0);
        let y4 = row_top_y(4, 5, GrowthDirection::TopDown, 10.0, 20.0);
        assert!(y0 > y4);
    }
}

#[cfg(test)]
mod lane_layout_tests {
    use crate::graph::GraphLayout;
    use crate::jj::Revision;
    use crate::prefs::SortMode;

    fn rev(id: &str, parents: &[&str]) -> Revision {
        Revision {
            change_id: id.into(),
            unique_prefix_len: 1,
            commit_id: "deadbeef".into(),
            unique_commit_prefix_len: 8,
            is_working_copy: id == "A",
            immutable: false,
            conflict: false,
            parents: parents.iter().map(|s| (*s).into()).collect(),
            bookmarks: vec![],
            author: "t".into(),
            committer_ts: "2026-01-01T00:00:00".into(),
            description: id.into(),
        }
    }

    #[test]
    fn linear_stack_stays_lane_zero() {
        let revs = vec![
            rev("A", &["B"]),
            rev("B", &["C"]),
            rev("C", &["D"]),
            rev("D", &[]),
        ];
        let layout = GraphLayout::build(revs, SortMode::WorkingCopyFirst);
        assert_eq!(layout.lane_count, 1, "linear stack must use a single lane");
        assert!(layout.nodes.iter().all(|n| n.lane == 0));
        assert!(layout
            .edges
            .iter()
            .all(|e| e.from_lane == 0 && e.to_lane == 0));
    }

    #[test]
    fn side_branches_fan_out_main_stays_left() {
        let revs = vec![
            rev("A", &["M"]),
            rev("Fb", &["M"]),
            rev("Fa", &["M"]),
            rev("M", &["R"]),
            rev("R", &[]),
        ];
        let layout = GraphLayout::build(revs, SortMode::WorkingCopyFirst);
        let lane = |id: &str| {
            layout
                .nodes
                .iter()
                .find(|n| n.rev.change_id == id)
                .unwrap()
                .lane
        };
        assert_eq!(lane("A"), 0);
        assert_eq!(lane("M"), 0);
        assert_eq!(lane("R"), 0);
        assert!(lane("Fb") > 0);
        assert!(lane("Fa") > 0);
        assert!(layout.lane_count >= 2);
    }

    #[test]
    fn temporary_repo_main_line_not_staircase() {
        let fixture = super::test_repo::TestRepo::linear();
        let repo = fixture.repo();
        let revs = repo.log(None).unwrap();
        let layout = GraphLayout::build(revs, SortMode::WorkingCopyFirst);
        let wc = layout.nodes.iter().find(|n| n.rev.is_working_copy).unwrap();
        assert_eq!(wc.lane, 0);
        let mut id = wc.rev.change_id.clone();
        let mut guard = 0;
        while guard < 32 {
            guard += 1;
            let node = layout.nodes.iter().find(|n| n.rev.change_id == id).unwrap();
            assert_eq!(
                node.lane, 0,
                "first-parent chain node {} should be lane 0",
                id
            );
            let Some(parent) = node.rev.parents.first() else {
                break;
            };
            if !layout.index.contains_key(parent) {
                break;
            }
            id = parent.clone();
        }
    }
}

#[cfg(test)]
mod undo_redo_tests {
    #[test]
    fn undo_redo_roundtrip_on_temp_repo() {
        let fixture = super::test_repo::TestRepo::new();
        fixture.jj(&["describe", "-m", "undo-me"]);
        let repo = fixture.repo();
        let description = || fixture.jj(&["log", "--no-graph", "-r", "@", "-T", "description"]);
        assert_eq!(description(), "undo-me");
        repo.undo().expect("undo");
        assert_eq!(description(), "");
        repo.redo().expect("redo");
        assert_eq!(description(), "undo-me");
        repo.undo().expect("undo again");
        assert_eq!(description(), "");
    }
}
