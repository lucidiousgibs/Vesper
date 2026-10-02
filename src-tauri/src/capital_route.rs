//! Automatic jump-drive pathfinding over real 3D space. Distinct from
//! route.rs's stargate-graph router - a jump drive doesn't follow the
//! stargate network at all, it's a direct line through space to any system
//! within range, so the "graph" here is implicit: two systems are adjacent
//! iff they're within the ship's jump range of each other. This only
//! produces the ordered system sequence; fuel/cooldown/fatigue evaluation of
//! that sequence stays in the frontend's existing capitalRoute.ts
//! (planCapitalRoute), unchanged.
//!
//! Security-space rule (hard, non-togglable, matches the one other mapping
//! tools in this community use - verified against SMT's own Navigation.cs,
//! `TrueSec > 0.45` is treated as high-sec/not jumpable): a jump drive can
//! neither activate from nor land in a system whose RAW (unrounded)
//! security_status exceeds 0.45. VESPER's own systems.security column is
//! already that raw SDE value (see map.rs's SystemRow), not the rounded
//! display value, so no separate lookup is needed.

use serde::Serialize;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::PathBuf;
use tauri::AppHandle;

use crate::map::ensure_synced;

const METERS_PER_LY: f64 = 9.4607e15;
/// Matches SMT's own Navigation.cs threshold (TrueSec > 0.45 == HighSec) -
/// see this module's own doc comment above.
const HIGH_SEC_THRESHOLD: f64 = 0.45;

#[derive(Serialize, Clone)]
pub struct AutoRouteNode {
    pub system_id: i64,
    pub system_name: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

struct EligibleSystem {
    id: i64,
    name: String,
    pos: [f64; 3],
}

/// Real, unchanging EVE naming conventions - J###### for wormhole systems,
/// AD### for Abyssal Deadspace pockets. Mirrored from
/// src/lib/format.ts's isWSpaceSystemName/isAbyssalSystemName: security_status
/// alone doesn't reliably separate w-space from null-sec, and neither is
/// part of the persistent stargate network a jump drive could usefully
/// target anyway.
fn is_wspace_or_abyssal(name: &str) -> bool {
    let bytes = name.as_bytes();
    let is_wspace = bytes.len() == 7 && bytes[0] == b'J' && bytes[1..].iter().all(u8::is_ascii_digit);
    let is_abyssal = bytes.len() == 5 && &name[0..2] == "AD" && bytes[2..].iter().all(u8::is_ascii_digit);
    is_wspace || is_abyssal
}

fn distance_ly(a: [f64; 3], b: [f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    (dx * dx + dy * dy + dz * dz).sqrt() / METERS_PER_LY
}

fn cell_of(pos: [f64; 3], cell_size: f64) -> (i64, i64, i64) {
    (
        (pos[0] / cell_size).floor() as i64,
        (pos[1] / cell_size).floor() as i64,
        (pos[2] / cell_size).floor() as i64,
    )
}

fn load_eligible_systems(path: &PathBuf, avoid: &HashSet<i64>) -> Result<Vec<EligibleSystem>, String> {
    let conn = rusqlite::Connection::open(path).map_err(|e| format!("failed to open map database: {e}"))?;
    let mut stmt = conn
        .prepare("SELECT id, name, security, real_x, real_y, real_z FROM systems")
        .map_err(|e| format!("failed to query systems: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let security: f64 = row.get(2)?;
            let x: f64 = row.get(3)?;
            let y: f64 = row.get(4)?;
            let z: f64 = row.get(5)?;
            Ok((id, name, security, x, y, z))
        })
        .map_err(|e| format!("failed to query systems: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        let (id, name, security, x, y, z) = row.map_err(|e| format!("failed to read system row: {e}"))?;
        if avoid.contains(&id) || security > HIGH_SEC_THRESHOLD || is_wspace_or_abyssal(&name) {
            continue;
        }
        result.push(EligibleSystem { id, name, pos: [x, y, z] });
    }
    Ok(result)
}

#[derive(Copy, Clone)]
struct HeapItem {
    f_score: f64,
    index: usize,
}

impl PartialEq for HeapItem {
    fn eq(&self, other: &Self) -> bool {
        self.f_score == other.f_score
    }
}
impl Eq for HeapItem {}
impl PartialOrd for HeapItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for HeapItem {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed so BinaryHeap (a max-heap) pops the LOWEST f_score first -
        // distances are always finite and non-negative, never NaN, so
        // partial_cmp().unwrap() is safe here.
        other.f_score.partial_cmp(&self.f_score).unwrap()
    }
}

/// A* over the implicit "within jump range" graph - straight-line LY
/// distance to the destination is an admissible heuristic since a jump drive
/// travels in a straight line, so it can never underestimate the true
/// remaining cost. Returns the ordered node sequence (origin through
/// destination inclusive), minimizing total LY traveled.
fn find_route(systems: &[EligibleSystem], origin_idx: usize, dest_idx: usize, range_ly: f64) -> Option<Vec<usize>> {
    if origin_idx == dest_idx {
        return Some(vec![origin_idx]);
    }

    let cell_size = range_ly * METERS_PER_LY;
    let mut grid: HashMap<(i64, i64, i64), Vec<usize>> = HashMap::new();
    for (i, s) in systems.iter().enumerate() {
        grid.entry(cell_of(s.pos, cell_size)).or_default().push(i);
    }

    let dest_pos = systems[dest_idx].pos;
    let mut g_score: HashMap<usize, f64> = HashMap::new();
    let mut came_from: HashMap<usize, usize> = HashMap::new();
    let mut open = BinaryHeap::new();

    g_score.insert(origin_idx, 0.0);
    open.push(HeapItem { f_score: distance_ly(systems[origin_idx].pos, dest_pos), index: origin_idx });

    let mut visited: HashSet<usize> = HashSet::new();

    while let Some(HeapItem { index: current, .. }) = open.pop() {
        if current == dest_idx {
            let mut path = vec![current];
            let mut node = current;
            while let Some(&prev) = came_from.get(&node) {
                path.push(prev);
                node = prev;
            }
            path.reverse();
            return Some(path);
        }
        if !visited.insert(current) {
            continue;
        }

        let current_g = g_score[&current];
        let current_pos = systems[current].pos;
        let (cx, cy, cz) = cell_of(current_pos, cell_size);
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let Some(candidates) = grid.get(&(cx + dx, cy + dy, cz + dz)) else { continue };
                    for &neighbor in candidates {
                        if neighbor == current || visited.contains(&neighbor) {
                            continue;
                        }
                        let ly = distance_ly(current_pos, systems[neighbor].pos);
                        if ly > range_ly {
                            continue;
                        }
                        let tentative_g = current_g + ly;
                        if tentative_g < *g_score.get(&neighbor).unwrap_or(&f64::INFINITY) {
                            g_score.insert(neighbor, tentative_g);
                            came_from.insert(neighbor, current);
                            let f = tentative_g + distance_ly(systems[neighbor].pos, dest_pos);
                            open.push(HeapItem { f_score: f, index: neighbor });
                        }
                    }
                }
            }
        }
    }

    None
}

pub async fn plan_auto_capital_route(
    app: &AppHandle,
    client: &reqwest::Client,
    origin_id: i64,
    destination_id: i64,
    range_ly: f64,
    avoid_ids: Vec<i64>,
) -> Result<Vec<AutoRouteNode>, String> {
    if range_ly <= 0.0 {
        return Err("Jump range must be greater than zero.".to_string());
    }
    let path = ensure_synced(app, client).await?;
    let avoid: HashSet<i64> = avoid_ids.into_iter().collect();

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<AutoRouteNode>, String> {
        let systems = load_eligible_systems(&path, &avoid)?;
        let origin_idx = systems.iter().position(|s| s.id == origin_id).ok_or_else(|| {
            "Origin system isn't jump-drive legal - a jump drive can't activate from high-sec space.".to_string()
        })?;
        let dest_idx = systems.iter().position(|s| s.id == destination_id).ok_or_else(|| {
            "Destination system isn't jump-drive legal - a jump drive can't land in high-sec space.".to_string()
        })?;

        let path_indices = find_route(&systems, origin_idx, dest_idx, range_ly).ok_or_else(|| {
            "No valid jump-drive path found within range - try a longer range or fewer avoided systems.".to_string()
        })?;

        Ok(path_indices
            .into_iter()
            .map(|i| {
                let s = &systems[i];
                AutoRouteNode { system_id: s.id, system_name: s.name.clone(), x: s.pos[0], y: s.pos[1], z: s.pos[2] }
            })
            .collect())
    })
    .await
    .map_err(|e| format!("auto-route pathfinding task failed: {e}"))?
}
