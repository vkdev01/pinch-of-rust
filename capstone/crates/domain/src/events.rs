use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    ApiCall,
    StorageWrite,
    JobRun,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            EventKind::ApiCall => "api_call",
            EventKind::StorageWrite => "storage_write",
            EventKind::JobRun => "job_run",
        }
    }

    pub fn parse(s: &str) -> Result<Self, DomainError> {
        match s {
            "api_call" => Ok(EventKind::ApiCall),
            "storage_write" => Ok(EventKind::StorageWrite),
            "job_run" => Ok(EventKind::JobRun),
            other => Err(DomainError::UnknownEventKind(other.to_string())),
        }
    }
}

/// One event as received from a customer. Validated before it is stored.
#[derive(Debug, Clone, Deserialize)]
pub struct IngestEvent {
    pub kind: String,
    #[serde(default = "one")]
    pub quantity: i64,
    #[serde(default)]
    pub meta: serde_json::Value,
}

fn one() -> i64 {
    1
}

#[derive(Debug, Error, PartialEq)]
pub enum DomainError {
    #[error("unknown event kind `{0}`")]
    UnknownEventKind(String),
    #[error("quantity must be between 1 and 1,000,000 (got {0})")]
    BadQuantity(i64),
    #[error("event metadata must be a JSON object")]
    BadMeta,
}

impl IngestEvent {
    pub fn validate(&self) -> Result<(EventKind, i64), DomainError> {
        let kind = EventKind::parse(&self.kind)?;
        if !(1..=1_000_000).contains(&self.quantity) {
            return Err(DomainError::BadQuantity(self.quantity));
        }
        if !self.meta.is_null() && !self.meta.is_object() {
            return Err(DomainError::BadMeta);
        }
        Ok((kind, self.quantity))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_kind() {
        let e = IngestEvent {
            kind: "nope".into(),
            quantity: 1,
            meta: serde_json::json!({}),
        };
        assert!(e.validate().is_err());
    }

    #[test]
    fn rejects_zero_quantity() {
        let e = IngestEvent {
            kind: "api_call".into(),
            quantity: 0,
            meta: serde_json::json!({}),
        };
        assert_eq!(e.validate(), Err(DomainError::BadQuantity(0)));
    }

    #[test]
    fn accepts_valid_event() {
        let e = IngestEvent {
            kind: "job_run".into(),
            quantity: 5,
            meta: serde_json::json!({}),
        };
        assert_eq!(e.validate().unwrap(), (EventKind::JobRun, 5));
    }
}
