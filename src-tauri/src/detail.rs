//! Diff-stat parsing and detail helpers (JayJay-inspired field set).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStat {
    pub insertions: u32,
    pub deletions: u32,
}

/// Files and exact totals from the same diff-stat invocation.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFilesResult {
    pub files: Vec<DiffFileEntry>,
    pub stat: DiffStat,
}

impl DiffStat {
    pub fn is_empty(self) -> bool {
        self.insertions == 0 && self.deletions == 0
    }
}

/// Parse the summary line from `jj diff --stat` / `git diff --stat` style output.
pub fn parse_diff_stat(stdout: &str) -> DiffStat {
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    for line in stdout.lines().rev() {
        let line = line.trim();
        if !(line.contains("insertion") || line.contains("deletion") || line.contains("changed")) {
            continue;
        }
        if let Some(n) = capture_before(line, "insertion") {
            insertions = n;
        }
        if let Some(n) = capture_before(line, "deletion") {
            deletions = n;
        }
        if line.contains("changed") || insertions > 0 || deletions > 0 {
            return DiffStat {
                insertions,
                deletions,
            };
        }
    }
    DiffStat::default()
}

fn capture_before(line: &str, needle: &str) -> Option<u32> {
    let idx = line.find(needle)?;
    let before = &line[..idx];
    let digits: String = before
        .chars()
        .rev()
        .skip_while(|c| c.is_whitespace() || *c == ',')
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

pub fn format_committer_ts(ts: &str) -> String {
    if ts.len() >= 19 && ts.as_bytes().get(10) == Some(&b'T') {
        let mut s = ts.to_string();
        s.replace_range(10..11, " ");
        s
    } else if ts.is_empty() {
        "—".into()
    } else {
        ts.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stat_plural() {
        let s = "2 files changed, 5 insertions(+), 0 deletions(-)\n";
        assert_eq!(
            parse_diff_stat(s),
            DiffStat {
                insertions: 5,
                deletions: 0
            }
        );
    }

    #[test]
    fn parse_stat_singular() {
        let s = "jj-bond-demo/README.md | 2 +-\njj-bond-demo/main.txt  | 1 +\n2 files changed, 2 insertions(+), 1 deletion(-)\n";
        assert_eq!(
            parse_diff_stat(s),
            DiffStat {
                insertions: 2,
                deletions: 1
            }
        );
    }

    #[test]
    fn parse_stat_zero() {
        let s = "0 files changed, 0 insertions(+), 0 deletions(-)\n";
        assert_eq!(parse_diff_stat(s), DiffStat::default());
    }

    #[test]
    fn format_ts_replaces_t() {
        assert_eq!(
            format_committer_ts("2026-10-25T17:54:25"),
            "2026-10-25 17:54:25"
        );
        assert_eq!(format_committer_ts(""), "—");
    }
}

/// One changed file in a revision (`jj diff --summary` + `--stat`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileEntry {
    pub path: String,
    /// Status letter: A / M / D / R / C / …
    pub status: String,
    pub insertions: u32,
    pub deletions: u32,
}

/// Parse `jj diff --summary` lines like `A path`, `M path`, `R {old => new}`.
pub fn parse_diff_summary(stdout: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut chars = line.chars();
        let Some(status_ch) = chars.next() else {
            continue;
        };
        if !status_ch.is_ascii_alphabetic() {
            continue;
        }
        let rest = chars.as_str().trim_start();
        if rest.is_empty() {
            continue;
        }
        let path = normalize_summary_path(rest);
        out.push((status_ch.to_ascii_uppercase().to_string(), path));
    }
    out
}

/// For renames `R {old => new}`, use the new path; otherwise the path as-is.
fn normalize_summary_path(raw: &str) -> String {
    if let Some(path) = parse_rename_new_path(raw) {
        path
    } else {
        raw.to_string()
    }
}

fn parse_rename_new_path(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if !(raw.starts_with('{') && raw.ends_with('}')) {
        return None;
    }
    let inner = &raw[1..raw.len() - 1];
    let (old, new) = inner.split_once("=>")?;
    let new = new.trim();
    if new.is_empty() || old.trim().is_empty() {
        None
    } else {
        Some(new.to_string())
    }
}

/// Stat key used to join with summary (rename keeps `{old => new}` form).
fn stat_join_key(raw_path: &str) -> String {
    if let Some(path) = parse_rename_new_path(raw_path) {
        path
    } else {
        raw_path.trim().to_string()
    }
}

/// Parse per-file ± from `jj diff --stat` (ignores the trailing summary line).
pub fn parse_diff_stat_files(stdout: &str) -> Vec<(String, u32, u32)> {
    let mut out = Vec::new();
    for line in stdout.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let trimmed = line.trim();
        if trimmed.contains("file changed")
            || trimmed.contains("files changed")
            || trimmed.contains("insertion")
            || trimmed.contains("deletion")
        {
            continue;
        }
        let Some((path_part, rest)) = line.rsplit_once('|') else {
            continue;
        };
        let path = stat_join_key(path_part.trim());
        if path.is_empty() {
            continue;
        }
        let rest = rest.trim();
        if rest.contains("binary") || rest.contains("Binary") {
            out.push((path, 0, 0));
            continue;
        }
        let (ins, del) = count_plus_minus(rest);
        out.push((path, ins, del));
    }
    out
}

fn count_plus_minus(rest: &str) -> (u32, u32) {
    let mut ins = 0u32;
    let mut del = 0u32;
    for c in rest.chars() {
        match c {
            '+' => ins = ins.saturating_add(1),
            '-' => del = del.saturating_add(1),
            _ => {}
        }
    }
    (ins, del)
}

/// Merge summary status letters with per-file ± from `--stat`.
pub fn merge_diff_files(
    summary: &[(String, String)],
    stats: &[(String, u32, u32)],
) -> Vec<DiffFileEntry> {
    let mut by_path: std::collections::HashMap<String, (u32, u32)> =
        stats.iter().cloned().map(|(p, i, d)| (p, (i, d))).collect();
    let mut files = Vec::with_capacity(summary.len());
    for (status, path) in summary {
        let (insertions, deletions) = by_path.remove(path).unwrap_or((0, 0));
        files.push(DiffFileEntry {
            path: path.clone(),
            status: status.clone(),
            insertions,
            deletions,
        });
    }
    // Orphan stat lines (should be rare) — treat as Modified.
    for (path, (insertions, deletions)) in by_path {
        if files.iter().any(|f| f.path == path) {
            continue;
        }
        files.push(DiffFileEntry {
            path,
            status: "M".into(),
            insertions,
            deletions,
        });
    }
    files
}

#[cfg(test)]
mod diff_files_tests {
    use super::*;

    #[test]
    fn parse_summary_amd() {
        let s = "A src/a.rs\nM src/b.rs\nD old.txt\n";
        assert_eq!(
            parse_diff_summary(s),
            vec![
                ("A".into(), "src/a.rs".into()),
                ("M".into(), "src/b.rs".into()),
                ("D".into(), "old.txt".into()),
            ]
        );
    }

    #[test]
    fn parse_summary_rename() {
        let s = "R {a.txt => b.txt}\n";
        assert_eq!(parse_diff_summary(s), vec![("R".into(), "b.txt".into())]);
    }

    #[test]
    fn parse_stat_histogram() {
        let s = "jj-complex-demo/CHANGELOG.md | 4 +++-\njj-complex-demo/VERSION      | 1 +\n2 files changed, 4 insertions(+), 1 deletion(-)\n";
        let files = parse_diff_stat_files(s);
        assert_eq!(
            files,
            vec![
                ("jj-complex-demo/CHANGELOG.md".into(), 3, 1),
                ("jj-complex-demo/VERSION".into(), 1, 0),
            ]
        );
    }

    #[test]
    fn parse_stat_binary_and_rename() {
        let s = "bin.dat | (binary) +4 bytes\n{a.txt => b.txt} | 0\n2 files changed, 0 insertions(+), 0 deletions(-)\n";
        let files = parse_diff_stat_files(s);
        assert_eq!(
            files,
            vec![("bin.dat".into(), 0, 0), ("b.txt".into(), 0, 0),]
        );
    }

    #[test]
    fn merge_joins_by_path() {
        let summary = parse_diff_summary("A foo\nM bar\n");
        let stats = parse_diff_stat_files(
            "foo | 2 ++\nbar | 3 +--\n2 files changed, 3 insertions(+), 2 deletions(-)\n",
        );
        let merged = merge_diff_files(&summary, &stats);
        assert_eq!(
            merged,
            vec![
                DiffFileEntry {
                    path: "foo".into(),
                    status: "A".into(),
                    insertions: 2,
                    deletions: 0,
                },
                DiffFileEntry {
                    path: "bar".into(),
                    status: "M".into(),
                    insertions: 1,
                    deletions: 2,
                },
            ]
        );
    }
}
