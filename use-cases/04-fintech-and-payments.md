---
summary: Money is integers, ledgers are append-only, and audits are code — what payments engineering demands from a language.
level: Intermediate
time: 25 min
tags: [fintech, correctness, money]
---

# Fintech and payments

Financial systems fail differently from other systems: the failure is silent,
retroactive, and measured in money. That changes what you want from a language.

## What the domain demands

| Requirement | What it forces |
| --- | --- |
| Exact arithmetic | Integer minor units, never floats |
| No silent overflow | An overflow that wraps is a wrong balance |
| Auditable failure | Every rejection has a typed reason, not a string |
| Determinism | The same input must produce the same output, in tests and in production |
| Long-lived correctness | Code outlives the team that wrote it |

Rust's contribution here is not speed. It is that the type system can be made to
carry the rules — and that a whole class of "it compiled, so it shipped" bugs
becomes impossible.

## Who runs it

Payments is a domain where companies talk less than infrastructure vendors do, so
public case studies are rarer. What is well documented:

- **Kraken** publicly rewrote exchange services in Rust, citing correctness under
  concurrency.
- **Stripe, Mercado Libre and others** have published Rust in internal tooling and
  services; most payment processors now run *some* Rust in the hot path even where
  the public surface is not Rust.
- The strongest evidence is structural: **double-entry ledgers, idempotency keys
  and typed money** are all things the Rust ecosystem has standardised crates for
  (`rust_decimal`, `money`, `uuid`, `serde`).

If you are evaluating Rust for a payment system, the question is not "who uses
it" but "does it make the wrong state unrepresentable". It does, better than most.

## Make illegal states unrepresentable

Start with money. A `f64` balance is a defect, not a style choice.

```rust
/// Amount in paise. The type is the unit — you cannot add a `Paise` to an `i64`
/// by accident, and you cannot accidentally store rupees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct Paise(i64);

impl Paise {
    pub const ZERO: Paise = Paise(0);

    pub fn checked_add(self, other: Paise) -> Option<Paise> {
        self.0.checked_add(other.0).map(Paise)      // overflow is an error, not a wrap
    }

    pub fn checked_sub(self, other: Paise) -> Option<Paise> {
        self.0.checked_sub(other.0).map(Paise)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overflow_is_an_error() {
        assert_eq!(Paise(i64::MAX).checked_add(Paise(1)), None);
    }
}
```

Then the ledger entry. Note the enum: a credit and a debit are different shapes,
and a transfer is one atomic operation, not two independent rows.

```rust
#[derive(Debug, Clone)]
pub enum Entry {
    Credit { account: AccountId, amount: Paise },
    Debit  { account: AccountId, amount: Paise },
}

#[derive(Debug)]
pub struct Transfer {
    pub idempotency_key: String,
    pub entries: Vec<Entry>,
}

impl Transfer {
    /// A double-entry transfer must net to zero. Enforce it at construction.
    pub fn new(idempotency_key: String, from: AccountId, to: AccountId, amount: Paise)
        -> Result<Self, LedgerError>
    {
        if amount <= Paise::ZERO {
            return Err(LedgerError::NonPositiveAmount(amount));
        }
        Ok(Self {
            idempotency_key,
            entries: vec![
                Entry::Debit  { account: from, amount },
                Entry::Credit { account: to,   amount },
            ],
        })
    }

    pub fn net(&self) -> Option<Paise> {
        self.entries.iter().try_fold(Paise::ZERO, |acc, e| match e {
            Entry::Credit { amount, .. } => acc.checked_add(*amount),
            Entry::Debit  { amount, .. } => acc.checked_sub(*amount),
        })
    }
}
```

`Transfer::new` is the only constructor, so a transfer that does not net to zero
cannot exist in the process. That is the whole technique.

## Idempotency, the non-negotiable

A client retries. A network duplicates. A queue redelivers. Every write must be
safe to apply twice.

```rust
pub async fn apply(pool: &PgPool, t: &Transfer) -> Result<Receipt, LedgerError> {
    let mut tx = pool.begin().await?;

    // The unique constraint on idempotency_key makes the second attempt a no-op.
    let claimed = sqlx::query(
        "INSERT INTO transfers (idempotency_key, amount_paise, created_at)
         VALUES ($1, $2, now()) ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(&t.idempotency_key)
    .bind(t.net().ok_or(LedgerError::Overflow)?.0.abs())
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if claimed == 0 {
        // already applied — return the original receipt, do not re-apply
        let receipt = load_receipt(&mut tx, &t.idempotency_key).await?;
        tx.commit().await?;
        return Ok(receipt);
    }

    for entry in &t.entries {
        sqlx::query(
            "INSERT INTO ledger_entries (transfer_id, account_id, delta_paise)
             SELECT id, $2, $3 FROM transfers WHERE idempotency_key = $1",
        )
        .bind(&t.idempotency_key)
        .bind(entry.account())
        .bind(entry.signed().0)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(Receipt { key: t.idempotency_key.clone() })
}
```

The balance is never stored as a mutable column. It is `SUM(delta_paise)` over the
ledger — which means the ledger and the balance cannot disagree. When performance
demands a materialised balance, it becomes a cache with a reconciliation job, not
the source of truth.

## Auditable failure

```rust
#[derive(Debug, thiserror::Error)]
pub enum LedgerError {
    #[error("amount must be positive, got {0:?}")]
    NonPositiveAmount(Paise),
    #[error("amount overflowed the ledger's range")]
    Overflow,
    #[error("account {0} is frozen")]
    AccountFrozen(AccountId),
    #[error("insufficient funds: needed {needed:?}, available {available:?}")]
    InsufficientFunds { needed: Paise, available: Paise },
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}
```

Each variant carries the numbers involved. When support asks "why was this
rejected", the answer is in the log line, not in a reconstruction.

## What to steal for your own project

1. **Newtypes for every unit.** `Paise`, `Bps`, `AccountId`, `IdempotencyKey`. The
   compiler then prevents the class of bug where two `i64`s get swapped.
2. **`checked_*` everywhere money is involved.** Set
   `[lints.clippy] arithmetic_side_effects = "deny"` in the crate that owns the
   ledger.
3. **Append-only tables.** `UPDATE balance` is how you lose an audit trail.
4. **Reconciliation as a test, not a runbook.** A proptest that generates random
   transfers and asserts `sum(entries) == 0` per transfer catches most real bugs.

## Where Rust is the wrong answer

- Back-office reporting and ad-hoc queries: use SQL, in the database.
- Pricing experiments and analytics: the tooling is Python's, and that is fine.
- Anything with a hard regulatory deadline and no Rust team: the migration risk
  outweighs the correctness gain.

## Try it

Write the `Transfer` type above, then write a proptest that generates 10,000 random
transfers between 100 accounts and asserts two invariants: every transfer nets to
zero, and `sum(all ledger deltas) == 0`. If both hold after a random kill -9 in the
middle, your ledger is sound.

**Next:** [Embedded and safety-critical](05-embedded-and-safety.md)
