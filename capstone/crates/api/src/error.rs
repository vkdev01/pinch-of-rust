use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Validation(String),
    #[error(transparent)]
    Domain(#[from] pulse_domain::DomainError),
    #[error("database error")]
    Db(#[from] sqlx::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::Validation(_) | ApiError::Domain(_) => {
                (StatusCode::UNPROCESSABLE_ENTITY, "validation")
            }
            ApiError::Db(_) => {
                // log the real error, never return it to the client
                tracing::error!(error = %self, "database failure");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal")
            }
        };

        let message = match status {
            StatusCode::INTERNAL_SERVER_ERROR => "internal error".to_string(),
            _ => self.to_string(),
        };

        (
            status,
            Json(json!({ "error": { "code": code, "message": message } })),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
