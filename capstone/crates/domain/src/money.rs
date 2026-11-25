use serde::{Deserialize, Serialize};

/// An amount in paise (1 INR = 100 paise). Never use floats for money.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Paise(pub i64);

impl Paise {
    pub const ZERO: Paise = Paise(0);

    pub fn rupees(&self) -> f64 {
        self.0 as f64 / 100.0
    }

    pub fn checked_add(self, other: Paise) -> Option<Paise> {
        self.0.checked_add(other.0).map(Paise)
    }

    /// Percentage change from `self` to `next`, rounded to one decimal place.
    pub fn pct_change(self, next: Paise) -> f64 {
        if self.0 == 0 {
            return 0.0;
        }
        let raw = (next.0 - self.0) as f64 / self.0 as f64 * 100.0;
        (raw * 10.0).round() / 10.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_to_rupees() {
        assert_eq!(Paise(499_000).rupees(), 4990.0);
    }

    #[test]
    fn computes_percentage_change() {
        assert_eq!(Paise(1000).pct_change(Paise(1120)), 12.0);
        assert_eq!(Paise(0).pct_change(Paise(500)), 0.0);
    }

    #[test]
    fn checked_add_detects_overflow() {
        assert_eq!(Paise(i64::MAX).checked_add(Paise(1)), None);
    }
}
