use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use sha2::{Digest, Sha256};

use crate::AppState;

/// The tenant a request is authenticated as. Handlers that need auth just take
/// this argument and the extractor does the rest.
pub struct TenantId(pub i64);

pub fn hash_key(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}

impl FromRequestParts<Arc<AppState>> for TenantId {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let raw = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let hash = hash_key(raw.trim());

        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT tenant_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
        )
        .bind(hash)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "api key lookup failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        row.map(|(id,)| TenantId(id)).ok_or(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_are_stable_and_hex() {
        let h = hash_key("abc");
        assert_eq!(h.len(), 64);
        assert_eq!(h, hash_key("abc"));
        assert_ne!(h, hash_key("abd"));
    }
}
