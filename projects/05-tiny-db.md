---
summary: Write a key-value store from scratch — WAL, memtable, SSTable compaction — and understand what a database actually does.
level: Advanced
time: 16–20 h
tags: [systems, files, performance]
---

# tiny-db — a key-value store you wrote yourself

Every "how does a database work" explanation is better after you have written one.
This project builds a log-structured merge store in ~800 lines: durable writes, a
sorted in-memory table, immutable on-disk tables, and compaction.

**What it is:** `tiny-db` — `put(k, v)`, `get(k)`, `delete(k)`, `scan(range)`, with
a write-ahead log so a crash never loses an acknowledged write.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| Binary formats | length-prefixed records, checksums, endianness |
| Crash safety | WAL, fsync ordering, atomic rename |
| Data structures | BTreeMap memtable, sorted SSTables, bloom filters |
| I/O performance | buffered writers, mmap, sequential reads |
| Testing invariants | property tests over a model implementation |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | In-memory map | `put`/`get` work |
| 2 | WAL | replay after a kill -9 loses nothing |
| 3 | Flush to SSTable | memory stays bounded at 10k keys |
| 4 | Read path | memtable → newest SSTable → oldest |
| 5 | Compaction | 20 SSTables merge into one |
| 6 | Correctness proof | proptest against `BTreeMap` |

## The write path

```rust
use std::collections::BTreeMap;
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write, Read, Seek, SeekFrom};

pub struct Store {
    wal: BufWriter<File>,
    mem: BTreeMap<Vec<u8>, Option<Vec<u8>>>,   // None = tombstone
    mem_bytes: usize,
    flush_at: usize,
}

impl Store {
    pub fn put(&mut self, key: &[u8], value: &[u8]) -> std::io::Result<()> {
        self.append_record(key, Some(value))?;
        self.mem.insert(key.to_vec(), Some(value.to_vec()));
        self.mem_bytes += key.len() + value.len();
        if self.mem_bytes >= self.flush_at {
            self.flush()?;               // memtable -> SSTable, then truncate the WAL
        }
        Ok(())
    }

    /// record = [u32 key_len][u32 val_len][u32 crc][key][val]   val_len == u32::MAX => delete
    fn append_record(&mut self, key: &[u8], value: Option<&[u8]>) -> std::io::Result<()> {
        let vlen = match value { Some(v) => v.len() as u32, None => u32::MAX };
        let mut rec = Vec::with_capacity(12 + key.len() + value.len().min(1 << 20));
        rec.extend_from_slice(&(key.len() as u32).to_le_bytes());
        rec.extend_from_slice(&vlen.to_le_bytes());
        rec.extend_from_slice(&0u32.to_le_bytes());  // crc placeholder
        rec.extend_from_slice(key);
        if let Some(v) = value { rec.extend_from_slice(v); }
        let crc = crc32(&rec[12..]);
        rec[8..12].copy_from_slice(&crc.to_le_bytes());

        self.wal.write_all(&rec)?;
        self.wal.flush()?;               // userspace buffer -> kernel
        self.wal.get_ref().sync_data()?; // kernel -> disk  (the expensive part)
        Ok(())
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut h = crc32fast::Hasher::new();
    h.update(bytes);
    h.finalize()
}
```

> **Gotcha:** `flush()` only drains the userspace buffer. `sync_data()` is what
> survives a power cut. Calling it per write gives you ~200 writes/s on a laptop;
> batching writes and syncing once gives you ~50,000/s at the cost of a small
> window. That trade-off *is* database engineering — make it explicit in a config.

## Recovery: replay until the record breaks

```rust
pub fn recover(wal_path: &Path) -> std::io::Result<BTreeMap<Vec<u8>, Option<Vec<u8>>>> {
    let mut mem = BTreeMap::new();
    let mut buf = Vec::new();
    if let Ok(mut f) = File::open(wal_path) {
        f.read_to_end(&mut buf)?;
    }

    let mut i = 0;
    while i + 12 <= buf.len() {
        let klen = u32::from_le_bytes(buf[i..i + 4].try_into().unwrap()) as usize;
        let vlen = u32::from_le_bytes(buf[i + 4..i + 8].try_into().unwrap());
        let crc = u32::from_le_bytes(buf[i + 8..i + 12].try_into().unwrap());
        let vlen = if vlen == u32::MAX { None } else { Some(vlen as usize) };

        let body_start = i + 12;
        let body_end = body_start + klen + vlen.unwrap_or(0);
        if body_end > buf.len() { break; }                        // torn tail
        if crc32(&buf[body_start..body_end]) != crc { break; }     // corrupt tail

        let key = buf[body_start..body_start + klen].to_vec();
        let value = vlen.map(|n| buf[body_start + klen..body_end].to_vec());
        mem.insert(key, value);
        i = body_end;
    }
    Ok(mem)
}
```

A partially written final record is expected after a crash. Stopping at the first
bad record — rather than erroring — is what makes the store crash-safe.

## The read path

```text
get(k):
  1. memtable          (newest writes)
  2. L0 SSTables       newest → oldest, first hit wins
  3. bloom filter      skip a table if the key is definitely absent
```

A bloom filter is 10 lines of hashing and removes ~99% of pointless disk reads.
Add it in milestone 5 and measure the hit-rate improvement in `perf stat`.

## Prove it correct

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn matches_btreemap(ops in prop::collection::vec(
        prop_oneof![
            (any::<u16>(), any::<u32>()).prop_map(|(k, v)| Op::Put(k, v)),
            any::<u16>().prop_map(Op::Del),
        ], 1..500))
    {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Store::open(dir.path(), 4096).unwrap();
        let mut model = std::collections::BTreeMap::new();

        for op in ops {
            match op {
                Op::Put(k, v) => { db.put(&k.to_le_bytes(), &v.to_le_bytes()).unwrap();
                                   model.insert(k, v); }
                Op::Del(k) => { db.delete(&k.to_le_bytes()).unwrap(); model.remove(&k); }
            }
        }
        for (k, v) in &model {
            prop_assert_eq!(db.get(&k.to_le_bytes()).unwrap(), Some(v.to_le_bytes().to_vec()));
        }
    }
}
```

Then kill the process randomly (`cargo-fuzz`, or a loop of `kill -9` in a shell
script) and assert every acknowledged write is still there. That test is worth
more than a thousand unit tests.

## Stretch goals

- Compaction with a size-tiered policy.
- `scan(range)` using SSTable block indexes.
- A block cache (LRU) in front of the tables.
- CRC per block instead of per record.
- A tiny RESP server so `redis-cli` can talk to it.

## Demo checklist

- [ ] 100k writes, kill -9, restart, zero data loss
- [ ] memory stays flat at 10M keys
- [ ] proptest green over 10,000 random operation sequences
- [ ] a `perf stat` comparison of sequential vs random reads
