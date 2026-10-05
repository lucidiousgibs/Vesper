//! A running count of the requests this app makes to EVE's ESI, for the activity lights and
//! request counts in the top bar. Every number here is a real request that really left the
//! machine: `counted` wraps the one place each ESI request is sent, so nothing is estimated.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

static SENT: AtomicU64 = AtomicU64::new(0);
static RECEIVED: AtomicU64 = AtomicU64::new(0);
static FAILED: AtomicU64 = AtomicU64::new(0);

/// Sends a request, counting it going out and its answer coming back. An answer that is a
/// transport error or an HTTP error status counts as failed as well as received (a status
/// code is still an answer; a timeout is not, so it counts as failed only).
pub async fn counted(request: reqwest::RequestBuilder) -> reqwest::Result<reqwest::Response> {
    SENT.fetch_add(1, Ordering::Relaxed);
    match request.send().await {
        Ok(response) => {
            RECEIVED.fetch_add(1, Ordering::Relaxed);
            if !response.status().is_success() {
                FAILED.fetch_add(1, Ordering::Relaxed);
            }
            Ok(response)
        }
        Err(err) => {
            FAILED.fetch_add(1, Ordering::Relaxed);
            Err(err)
        }
    }
}

#[derive(Serialize)]
pub struct NetStats {
    pub sent: u64,
    pub received: u64,
    pub failed: u64,
}

pub fn snapshot() -> NetStats {
    NetStats {
        sent: SENT.load(Ordering::Relaxed),
        received: RECEIVED.load(Ordering::Relaxed),
        failed: FAILED.load(Ordering::Relaxed),
    }
}
