//! A quick per-system signature scratchpad for the main map - distinct from
//! the wormhole-chain tool's own `signatures` table (wormholes.rs), which is
//! keyed by `chain_system_id` (a manually-plotted chain's own internal id,
//! tied to that chain's connections/mass-tracking schema) rather than a
//! plain k-space `system_id`. This exists so a pilot scanning down sites in
//! null-sec/low-sec space (no wormhole chain involved at all) has somewhere
//! to paste the Scanning window's output without forcing that paste through
//! chain machinery that doesn't apply here - no connections, no mass
//! tracking, just "what's in this system right now".
//!
//! Shares the exact same paste format/classification as the chain tool (see
//! `src/lib/signatureParsing.ts` on the frontend, and reuses
//! `wormholes::ParsedSignature` here) and the same upsert-by-(system, sig_id)
//! semantics as `wormholes::import_signatures`, just against a simpler table.
use crate::wormholes::ParsedSignature;
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::Manager;

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| format!("could not resolve app data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create app data directory: {e}"))?;
    Ok(dir.join("map_scratchpad.sqlite"))
}

fn ensure_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS scratchpad_signatures (
            id TEXT PRIMARY KEY,
            system_id INTEGER NOT NULL,
            sig_id TEXT NOT NULL,
            sig_type TEXT NOT NULL DEFAULT '',
            signal_strength TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL DEFAULT 'unknown',
            first_seen_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scratchpad_signatures_system ON scratchpad_signatures (system_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scratchpad_signatures_unique ON scratchpad_signatures (system_id, sig_id);",
    )
    .map_err(|e| e.to_string())
}

fn now_unix() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Same hex-not-UUID-crate id generation as wormholes.rs's new_id.
fn new_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Serialize, Clone)]
pub struct ScratchpadSignature {
    pub id: String,
    pub system_id: i64,
    pub sig_id: String,
    pub sig_type: String,
    pub signal_strength: String,
    pub kind: String,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
}

#[derive(Serialize)]
pub struct ImportScratchpadResult {
    pub imported: i64,
    pub updated: i64,
    pub missing_sig_ids: Vec<String>,
}

pub async fn list_scratchpad_signatures(app: tauri::AppHandle, system_id: i64) -> Result<Vec<ScratchpadSignature>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<ScratchpadSignature>, String> {
        let conn = rusqlite::Connection::open(db_path(&app)?).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, system_id, sig_id, sig_type, signal_strength, kind, first_seen_at, last_seen_at
                 FROM scratchpad_signatures WHERE system_id = ?1 ORDER BY first_seen_at",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([system_id], |row| {
                Ok(ScratchpadSignature {
                    id: row.get(0)?,
                    system_id: row.get(1)?,
                    sig_id: row.get(2)?,
                    sig_type: row.get(3)?,
                    signal_strength: row.get(4)?,
                    kind: row.get(5)?,
                    first_seen_at: row.get(6)?,
                    last_seen_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Same "never silently delete on a partial paste" behavior as
/// wormholes::import_signatures - sigs missing from this paste are reported
/// in missing_sig_ids for the user to review/delete by hand, not removed
/// automatically.
pub async fn import_scratchpad_signatures(
    app: tauri::AppHandle,
    system_id: i64,
    signatures: Vec<ParsedSignature>,
) -> Result<ImportScratchpadResult, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ImportScratchpadResult, String> {
        let mut conn = rusqlite::Connection::open(db_path(&app)?).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        let now = now_unix();

        let mut existing_sig_ids: HashSet<String> = HashSet::new();
        {
            let mut stmt = conn.prepare("SELECT sig_id FROM scratchpad_signatures WHERE system_id = ?1").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([system_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            for row in rows {
                existing_sig_ids.insert(row.map_err(|e| e.to_string())?);
            }
        }

        let mut imported = 0i64;
        let mut updated = 0i64;
        let pasted_sig_ids: HashSet<String> = signatures.iter().map(|s| s.sig_id.clone()).collect();

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for sig in &signatures {
            if existing_sig_ids.contains(&sig.sig_id) {
                updated += 1;
            } else {
                imported += 1;
            }
            tx.execute(
                "INSERT INTO scratchpad_signatures (id, system_id, sig_id, sig_type, signal_strength, kind, first_seen_at, last_seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                 ON CONFLICT(system_id, sig_id) DO UPDATE SET
                    sig_type = excluded.sig_type,
                    signal_strength = excluded.signal_strength,
                    kind = excluded.kind,
                    last_seen_at = excluded.last_seen_at",
                rusqlite::params![new_id(), system_id, sig.sig_id, sig.sig_type, sig.signal_strength, sig.kind, now],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;

        let missing_sig_ids: Vec<String> = existing_sig_ids.difference(&pasted_sig_ids).cloned().collect();
        Ok(ImportScratchpadResult { imported, updated, missing_sig_ids })
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn delete_scratchpad_signature(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let conn = rusqlite::Connection::open(db_path(&app)?).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        conn.execute("DELETE FROM scratchpad_signatures WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
