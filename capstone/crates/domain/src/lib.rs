//! Domain types and rules for Pulse. No I/O, no async — so these tests run in
//! microseconds and the public API is the contract everything else builds on.

pub mod dashboard;
pub mod events;
pub mod money;

pub use dashboard::{Dashboard, InvoiceRow, PlanRow, Quota, UsageDay};
pub use events::{DomainError, EventKind, IngestEvent};
pub use money::Paise;
