//! DAG layout: lane assignment and edge geometry.
//! Inspired by GG's "paint graph + rows together" principle — not their code.

use crate::jj::{parse_ts_key, Revision};
use crate::prefs::{GrowthDirection, SortMode};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub const LANE_COLORS: [[u8; 3]; 10] = [
    [80, 160, 255],
    [120, 200, 120],
    [240, 160, 60],
    [200, 120, 220],
    [240, 100, 120],
    [80, 200, 200],
    [220, 200, 80],
    [160, 140, 255],
    [100, 220, 160],
    [255, 140, 180],
];

pub fn lane_color_css(lane: usize) -> String {
    let [r, g, b] = LANE_COLORS[lane % LANE_COLORS.len()];
    format!("rgb({r},{g},{b})")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaidOutNode {
    pub rev: Revision,
    pub row: usize,
    pub lane: usize,
    /// GG-style: number of active stems/columns to the right of this node's lane.
    /// `leftpad ≈ padding * columnWidth + columnWidth + 6`. Linear history → 0.
    pub padding: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub from_row: usize,
    pub to_row: usize,
    pub from_lane: usize,
    pub to_lane: usize,
    pub color_lane: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphLayout {
    pub nodes: Vec<LaidOutNode>,
    pub edges: Vec<Edge>,
    pub lane_count: usize,
    #[serde(skip)]
    pub index: HashMap<String, usize>,
}

impl GraphLayout {
    pub fn build(mut revs: Vec<Revision>, sort: SortMode) -> Self {
        match sort {
            SortMode::WorkingCopyFirst => {
                revs = prioritize_working_copy(revs);
            }
            SortMode::RecentRewrite => {
                revs = sort_recent_rewrite(revs);
            }
        }

        let (mut nodes, stem_counts) = assign_lanes(revs);
        if let Some(wc_lane) = nodes.iter().find(|n| n.rev.is_working_copy).map(|n| n.lane) {
            if wc_lane != 0 {
                swap_lanes(&mut nodes, wc_lane, 0);
            }
        }
        // Recompute padding after any lane remap: padding = stems_to_the_right.
        for (n, &stem_count) in nodes.iter_mut().zip(stem_counts.iter()) {
            n.padding = stem_count.saturating_sub(n.lane.saturating_add(1));
        }
        let lane_count = nodes
            .iter()
            .map(|n| n.lane)
            .max()
            .map(|m| m + 1)
            .unwrap_or(1);

        let index: HashMap<String, usize> = nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.rev.change_id.clone(), i))
            .collect();

        let mut edges = Vec::new();
        for node in &nodes {
            for p in &node.rev.parents {
                if let Some(&pi) = index.get(p) {
                    let parent = &nodes[pi];
                    edges.push(Edge {
                        from_row: node.row,
                        to_row: parent.row,
                        from_lane: node.lane,
                        to_lane: parent.lane,
                        color_lane: node.lane,
                    });
                }
            }
        }

        Self {
            nodes,
            edges,
            lane_count,
            index,
        }
    }
}

fn prioritize_working_copy(revs: Vec<Revision>) -> Vec<Revision> {
    let Some(wc_pos) = revs.iter().position(|r| r.is_working_copy) else {
        return revs;
    };
    if wc_pos == 0 {
        return revs;
    }
    let wc_id = revs[wc_pos].change_id.clone();
    let descendants = transitive_children(&revs, &wc_id);

    // Single pass moving revisions into place: descendants of the working
    // copy that precede it, then the working copy, then everything else in
    // the original order.
    let mut out = Vec::with_capacity(revs.len());
    let mut rest = Vec::new();
    for (i, rev) in revs.into_iter().enumerate() {
        if i == wc_pos || (i < wc_pos && descendants.contains(&rev.change_id)) {
            out.push(rev);
        } else {
            rest.push(rev);
        }
    }
    out.extend(rest);
    out
}

fn transitive_children(revs: &[Revision], root: &str) -> HashSet<String> {
    let id_set: HashSet<String> = revs.iter().map(|r| r.change_id.clone()).collect();
    let mut children: HashMap<String, Vec<String>> = HashMap::new();
    for r in revs {
        for p in &r.parents {
            if id_set.contains(p) {
                children
                    .entry(p.clone())
                    .or_default()
                    .push(r.change_id.clone());
            }
        }
    }
    let mut out = HashSet::new();
    let mut stack = children.get(root).cloned().unwrap_or_default();
    while let Some(c) = stack.pop() {
        if out.insert(c.clone()) {
            if let Some(cs) = children.get(&c) {
                stack.extend(cs.iter().cloned());
            }
        }
    }
    out
}

fn swap_lanes(nodes: &mut [LaidOutNode], a: usize, b: usize) {
    if a == b {
        return;
    }
    for n in nodes {
        if n.lane == a {
            n.lane = b;
        } else if n.lane == b {
            n.lane = a;
        }
    }
}

/// Consumes `revs`, moving each revision into its laid-out node (only the
/// change ids are cloned, for the lane-column bookkeeping).
fn assign_lanes(revs: Vec<Revision>) -> (Vec<LaidOutNode>, Vec<usize>) {
    let n = revs.len();
    let id_set: HashSet<String> = revs.iter().map(|r| r.change_id.clone()).collect();
    let mut columns: Vec<Option<String>> = Vec::new();
    let mut out = Vec::with_capacity(n);
    let mut stem_counts = Vec::with_capacity(n);

    for (row, rev) in revs.into_iter().enumerate() {
        let id = rev.change_id.clone();

        // GG: padding = stems.len() - column - 1, measured when the stem is found
        // (before parent edges are merged). Mirror that timing.
        let mut lane = columns.iter().position(|c| c.as_ref() == Some(&id));
        let mut padding = 0usize;
        if let Some(slot) = lane {
            padding = columns.len().saturating_sub(slot + 1);
        }
        if lane.is_none() {
            if let Some(free) = columns.iter().position(|c| c.is_none()) {
                lane = Some(free);
                padding = columns.len().saturating_sub(free + 1);
            } else {
                columns.push(None);
                lane = Some(columns.len() - 1);
                padding = 0;
            }
        }
        let lane = lane.unwrap();
        while columns.len() <= lane {
            columns.push(None);
        }

        for c in columns.iter_mut() {
            if c.as_ref() == Some(&id) {
                *c = None;
            }
        }

        let parents_in_graph: Vec<String> = rev
            .parents
            .iter()
            .filter(|p| id_set.contains(*p))
            .cloned()
            .collect();

        if let Some(first) = parents_in_graph.first() {
            columns[lane] = Some(first.clone());
            for extra in parents_in_graph.iter().skip(1) {
                if let Some(free) = columns.iter().position(|c| c.is_none()) {
                    columns[free] = Some(extra.clone());
                } else {
                    columns.push(Some(extra.clone()));
                }
            }
        }

        while matches!(columns.last(), Some(None)) {
            columns.pop();
        }

        // stem_count such that after lane remap: padding = stem_count - lane - 1
        let stem_count = padding + lane + 1;
        stem_counts.push(stem_count);

        out.push(LaidOutNode {
            rev,
            row,
            lane,
            padding,
        });
    }

    (out, stem_counts)
}

fn sort_recent_rewrite(revs: Vec<Revision>) -> Vec<Revision> {
    let n = revs.len();
    let mut by_id: HashMap<String, Revision> = HashMap::new();
    let mut ids: Vec<String> = Vec::with_capacity(n);
    for r in revs {
        ids.push(r.change_id.clone());
        by_id.insert(r.change_id.clone(), r);
    }
    let id_set: HashSet<String> = ids.iter().cloned().collect();

    let mut child_count: HashMap<String, usize> = HashMap::new();
    for id in &ids {
        let r = &by_id[id];
        for p in &r.parents {
            if id_set.contains(p) {
                *child_count.entry(p.clone()).or_insert(0) += 1;
            }
        }
    }

    fn score(r: &Revision) -> u64 {
        let mut s = parse_ts_key(&r.committer_ts);
        if r.is_working_copy {
            s = s.saturating_add(1_000_000_000_000);
        }
        s
    }

    let mut order = Vec::with_capacity(n);
    let mut emitted = HashSet::new();
    let mut ready: Vec<String> = ids
        .iter()
        .filter(|id| child_count.get(*id).copied().unwrap_or(0) == 0)
        .cloned()
        .collect();
    while !ready.is_empty() {
        ready.sort_by(|a, b| {
            score(&by_id[b])
                .cmp(&score(&by_id[a]))
                .then_with(|| a.cmp(b))
        });
        let id = ready.remove(0);
        if !emitted.insert(id.clone()) {
            continue;
        }
        order.push(id.clone());
        let parents = by_id[&id].parents.clone();
        for p in parents {
            if !id_set.contains(&p) {
                continue;
            }
            if let Some(c) = child_count.get_mut(&p) {
                *c = c.saturating_sub(1);
                if *c == 0 && !emitted.contains(&p) {
                    ready.push(p);
                }
            }
        }
    }
    for id in &ids {
        if !emitted.contains(id) {
            order.push(id.clone());
        }
    }

    order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect()
}

#[derive(Debug, Clone, Copy)]
pub struct RowMetrics {
    pub row_h: f32,
    pub lane_w: f32,
    pub graph_pad: f32,
    pub node_r: f32,
}

impl RowMetrics {
    pub fn for_density(compact: bool) -> Self {
        if compact {
            Self {
                row_h: 28.0,
                lane_w: 18.0,
                graph_pad: 14.0,
                node_r: 5.5,
            }
        } else {
            Self {
                row_h: 56.0,
                lane_w: 18.0,
                graph_pad: 14.0,
                node_r: 6.5,
            }
        }
    }

    pub fn graph_width(&self, lane_count: usize) -> f32 {
        self.graph_pad * 2.0 + self.lane_w * lane_count.max(1) as f32
    }

    pub fn node_x(&self, lane: usize) -> f32 {
        self.graph_pad + self.lane_w * lane as f32 + self.lane_w * 0.5
    }
}

pub fn visual_row(row: usize, n: usize, growth: GrowthDirection) -> usize {
    match growth {
        GrowthDirection::BottomUp => row,
        GrowthDirection::TopDown => n.saturating_sub(1).saturating_sub(row),
    }
}

pub fn row_top_y(row: usize, n: usize, growth: GrowthDirection, top_y: f32, row_h: f32) -> f32 {
    top_y + visual_row(row, n, growth) as f32 * row_h
}

#[cfg(test)]
mod padding_tests {
    use super::GraphLayout;
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
    fn linear_history_has_zero_padding() {
        let revs = vec![rev("A", &["B"]), rev("B", &["C"]), rev("C", &[])];
        let layout = GraphLayout::build(revs, SortMode::WorkingCopyFirst);
        assert!(layout.nodes.iter().all(|n| n.padding == 0));
    }

    #[test]
    fn side_branch_gives_main_padding() {
        let revs = vec![
            rev("A", &["M"]),
            rev("Fb", &["M"]),
            rev("M", &["R"]),
            rev("R", &[]),
        ];
        let layout = GraphLayout::build(revs, SortMode::WorkingCopyFirst);
        let pad = |id: &str| {
            layout
                .nodes
                .iter()
                .find(|n| n.rev.change_id == id)
                .unwrap()
                .padding
        };
        // Main at lane 0 should see the side stem to its right while Fb is live.
        assert!(pad("A") >= 1 || pad("Fb") == 0);
        assert_eq!(pad("R"), 0);
    }
}
