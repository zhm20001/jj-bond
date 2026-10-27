//! Persisted user preferences (XDG config on Linux, platform dirs elsewhere).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum DensityMode {
    #[default]
    #[serde(alias = "Compact")]
    Compact,
    #[serde(alias = "Rich")]
    Rich,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SortMode {
    #[default]
    #[serde(alias = "WorkingCopyFirst")]
    WorkingCopyFirst,
    #[serde(alias = "RecentRewrite")]
    RecentRewrite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum GrowthDirection {
    #[default]
    #[serde(alias = "BottomUp")]
    BottomUp,
    #[serde(alias = "TopDown")]
    TopDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Locale {
    #[default]
    Zh,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum DiffViewMode {
    #[default]
    Unified,
    SideBySide,
}

fn default_detail_panel_open() -> bool {
    true
}

fn default_detail_panel_width() -> u32 {
    320
}

fn default_diff_panel_width() -> u32 {
    420
}

fn default_diff_view_mode() -> DiffViewMode {
    DiffViewMode::Unified
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub density: DensityMode,
    pub sort: SortMode,
    #[serde(default)]
    pub growth: GrowthDirection,
    #[serde(default)]
    pub theme: ThemeMode,
    #[serde(default)]
    pub locale: Locale,
    #[serde(default = "default_detail_panel_open", alias = "detail_panel_open")]
    pub detail_panel_open: bool,
    #[serde(default = "default_detail_panel_width", alias = "detail_panel_width")]
    pub detail_panel_width: u32,
    #[serde(default = "default_diff_panel_width", alias = "diff_panel_width")]
    pub diff_panel_width: u32,
    #[serde(default = "default_diff_view_mode", alias = "diff_view_mode")]
    pub diff_view_mode: DiffViewMode,
    #[serde(default, alias = "last_repo")]
    pub last_repo: Option<String>,
    /// Last applied revset filter (empty / None → all()).
    #[serde(default, alias = "last_revset")]
    pub last_revset: Option<String>,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            density: DensityMode::Compact,
            sort: SortMode::WorkingCopyFirst,
            growth: GrowthDirection::BottomUp,
            theme: ThemeMode::System,
            locale: Locale::Zh,
            detail_panel_open: true,
            detail_panel_width: 320,
            diff_panel_width: 420,
            diff_view_mode: DiffViewMode::Unified,
            last_repo: None,
            last_revset: None,
        }
    }
}

fn config_path() -> Result<PathBuf> {
    let dirs = directories::ProjectDirs::from("dev", "jj-bond", "jj-bond")
        .context("could not resolve config directory")?;
    Ok(dirs.config_dir().join("prefs.json"))
}

impl Prefs {
    pub fn load() -> Self {
        match Self::try_load() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("jj-bond: using default prefs ({e})");
                Self::default()
            }
        }
    }

    fn try_load() -> Result<Self> {
        let path = config_path()?;
        if !path.exists() {
            if let Some(migrated) = Self::try_migrate_from_jj_gui() {
                let _ = migrated.save();
                return Ok(migrated);
            }
            return Ok(Self::default());
        }
        let data = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        serde_json::from_str(&data).context("parse prefs.json")
    }

    fn try_migrate_from_jj_gui() -> Option<Self> {
        let old = directories::ProjectDirs::from("dev", "jj-gui", "jj-gui")?;
        let old_path = old.config_dir().join("prefs.json");
        if !old_path.exists() {
            return None;
        }
        let data = fs::read_to_string(&old_path).ok()?;
        let mut prefs: Prefs = serde_json::from_str(&data).ok()?;
        if let Some(repo) = prefs.last_repo.as_mut() {
            *repo = repo
                .replace("jj-gui-demo", "jj-bond-demo")
                .replace("/jj-gui", "/jj-bond");
        }
        Some(prefs)
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(self)?;
        fs::write(&path, data).with_context(|| format!("write {}", path.display()))?;
        Ok(())
    }
}

#[cfg(test)]
mod locale_tests {
    use super::*;

    #[test]
    fn locale_serde_camel_case() {
        assert_eq!(serde_json::to_string(&Locale::Zh).unwrap(), "\"zh\"");
        assert_eq!(serde_json::to_string(&Locale::En).unwrap(), "\"en\"");
        assert_eq!(
            serde_json::from_str::<Locale>("\"zh\"").unwrap(),
            Locale::Zh
        );
        assert_eq!(
            serde_json::from_str::<Locale>("\"en\"").unwrap(),
            Locale::En
        );
    }

    #[test]
    fn prefs_default_locale_is_zh_and_roundtrips() {
        let p = Prefs::default();
        assert_eq!(p.locale, Locale::Zh);
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"locale\":\"zh\""), "{json}");
        let back: Prefs = serde_json::from_str(&json).unwrap();
        assert_eq!(back.locale, Locale::Zh);
        // Missing locale field deserializes to default Zh
        let without = r#"{"density":"compact","sort":"workingCopyFirst"}"#;
        let migrated: Prefs = serde_json::from_str(without).unwrap();
        assert_eq!(migrated.locale, Locale::Zh);
    }
}
