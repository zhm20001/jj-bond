#![allow(dead_code)]
//! jj-bond Tauri backend: wrap jj CLI + graph layout + prefs.

mod detail;
mod graph;
mod jj;
mod prefs;

use detail::{DiffFilesResult, DiffStat};
use graph::GraphLayout;
use jj::{ConflictEntry, JjRepo};
use prefs::{DensityMode, GrowthDirection, Prefs, SortMode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResult {
    path: String,
    layout: GraphLayout,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogRequest {
    path: String,
    sort: SortMode,
    #[serde(default)]
    revset: Option<String>,
}

fn err_string(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn load_prefs() -> Prefs {
    Prefs::load()
}

#[tauri::command]
fn save_prefs(prefs: Prefs) -> Result<(), String> {
    prefs.save().map_err(err_string)
}

#[tauri::command]
fn open_repo(path: String, sort: SortMode, revset: Option<String>) -> Result<OpenResult, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    let display = repo.path_display();
    let revs = repo.log(revset.as_deref()).map_err(err_string)?;
    let layout = GraphLayout::build(revs, sort);
    let mut prefs = Prefs::load();
    prefs.last_repo = Some(display.clone());
    if let Some(r) = revset.as_ref() {
        let trimmed = r.trim();
        prefs.last_revset = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    let _ = prefs.save();
    Ok(OpenResult {
        path: display,
        layout,
    })
}

#[tauri::command]
fn reload_log(req: LogRequest) -> Result<GraphLayout, String> {
    let repo = JjRepo::open(&req.path).map_err(err_string)?;
    let revs = repo.log(req.revset.as_deref()).map_err(err_string)?;
    if let Some(r) = req.revset.as_ref() {
        let mut prefs = Prefs::load();
        let trimmed = r.trim();
        prefs.last_revset = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
        let _ = prefs.save();
    }
    Ok(GraphLayout::build(revs, req.sort))
}

#[tauri::command]
fn diff_stat(
    path: String,
    change_id: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<DiffStat, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.diff_stat(&change_id, from.as_deref(), to.as_deref())
        .map_err(err_string)
}

#[tauri::command]
fn diff_files(
    path: String,
    change_id: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<DiffFilesResult, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.diff_files(&change_id, from.as_deref(), to.as_deref())
        .map_err(err_string)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffFileText {
    text: String,
}

#[tauri::command]
fn diff_file(
    path: String,
    change_id: String,
    file_path: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<DiffFileText, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    let text = repo
        .diff_file(&change_id, &file_path, from.as_deref(), to.as_deref())
        .map_err(err_string)?;
    Ok(DiffFileText { text })
}

#[tauri::command]
fn list_conflicts(path: String, revision: String) -> Result<Vec<ConflictEntry>, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.list_conflicts(&revision).map_err(err_string)
}

#[tauri::command]
fn resolve_conflict(
    path: String,
    revision: String,
    file_path: String,
    tool: String,
) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.resolve_conflict(&revision, &file_path, &tool)
        .map_err(err_string)
}

#[tauri::command]
fn jj_edit(path: String, change_id: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.edit(&change_id).map_err(err_string)
}

#[tauri::command]
fn jj_new(path: String, change_id: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.new_child(&change_id).map_err(err_string)
}

#[tauri::command]
fn jj_rebase(path: String, revisions: Vec<String>, destination: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.rebase_revisions(&revisions, &destination)
        .map_err(err_string)
}

#[tauri::command]
fn jj_undo(path: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.undo().map_err(err_string)
}

#[tauri::command]
fn jj_redo(path: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.redo().map_err(err_string)
}

#[tauri::command]
fn jj_new_revisions(path: String, revisions: Vec<String>, mode: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.new_revisions(&revisions, &mode).map_err(err_string)
}

#[tauri::command]
fn jj_abandon(path: String, revisions: Vec<String>) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.abandon(&revisions).map_err(err_string)
}

#[tauri::command]
fn jj_squash(path: String, revisions: Vec<String>, into: Option<String>) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.squash_revisions(&revisions, into.as_deref())
        .map_err(err_string)
}

#[tauri::command]
fn jj_restore_from_parent(
    path: String,
    revisions: Vec<String>,
    parent: String,
) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.restore_from_parent(&revisions, &parent)
        .map_err(err_string)
}

#[tauri::command]
fn jj_duplicate(path: String, revisions: Vec<String>) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.duplicate(&revisions).map_err(err_string)
}

#[tauri::command]
fn jj_revert_onto_wc(path: String, revisions: Vec<String>) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.revert_onto_wc(&revisions).map_err(err_string)
}

#[tauri::command]
fn jj_bookmark_create(path: String, name: String, revision: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.bookmark_create(&name, &revision).map_err(err_string)
}

#[tauri::command]
fn jj_bookmark_move(path: String, name: String, revision: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.bookmark_move(&name, &revision).map_err(err_string)
}

#[tauri::command]
fn jj_bookmark_rename(path: String, old: String, new: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.bookmark_rename(&old, &new).map_err(err_string)
}

#[tauri::command]
fn jj_bookmark_delete(path: String, name: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.bookmark_delete(&name).map_err(err_string)
}

#[tauri::command]
fn jj_describe(path: String, revision: String, message: String) -> Result<String, String> {
    let repo = JjRepo::open(&path).map_err(err_string)?;
    repo.describe_revision(&revision, &message)
        .map_err(err_string)
}

#[tauri::command]
fn initial_repo_hint() -> Option<String> {
    // CLI: --repo / path from env JJ_BOND_REPO / prefs.last_repo
    let args: Vec<String> = std::env::args().collect();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--repo" {
            if let Some(p) = args.get(i + 1) {
                return Some(p.clone());
            }
        }
        if let Some(rest) = args[i].strip_prefix("--repo=") {
            return Some(rest.to_string());
        }
        i += 1;
    }
    if let Ok(p) = std::env::var("JJ_BOND_REPO") {
        if !p.is_empty() {
            return Some(p);
        }
    }
    Prefs::load().last_repo
}

/// Open `path` in the OS file manager (Finder / Explorer / xdg-open).
#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {path}"));
    }
    // Prefer directory: if a file is passed, reveal its parent.
    let target = if p.is_file() {
        p.parent().map(|x| x.to_path_buf()).unwrap_or(p)
    } else {
        p
    };
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            // status() reaps the child; spawn() would leak a zombie per call.
            .status()
            .map_err(err_string)?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target)
            .status()
            .map_err(err_string)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .status()
            .map_err(err_string)?;
    }
    Ok(())
}

#[tauri::command]
fn lane_palette() -> Vec<String> {
    (0..graph::LANE_COLORS.len())
        .map(graph::lane_color_css)
        .collect()
}

// Silence unused import warnings for types re-exported via commands.
#[allow(dead_code)]
fn _type_anchors() {
    let _ = DensityMode::Compact;
    let _ = GrowthDirection::BottomUp;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_prefs,
            save_prefs,
            open_repo,
            reload_log,
            diff_stat,
            diff_files,
            diff_file,
            list_conflicts,
            resolve_conflict,
            jj_edit,
            jj_new,
            jj_new_revisions,
            jj_rebase,
            jj_undo,
            jj_redo,
            jj_abandon,
            jj_squash,
            jj_restore_from_parent,
            jj_duplicate,
            jj_revert_onto_wc,
            jj_bookmark_create,
            jj_bookmark_move,
            jj_bookmark_rename,
            jj_bookmark_delete,
            jj_describe,
            initial_repo_hint,
            reveal_in_file_manager,
            lane_palette,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
