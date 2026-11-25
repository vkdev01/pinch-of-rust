# 06 · Trees and ordered maps

When you need order, ranges or a prefix, a hash map stops helping and a tree starts.

## `BTreeMap`: the tree you should actually use

```rust
use std::collections::BTreeMap;

let mut t: BTreeMap<u64, &str> = BTreeMap::new();
t.insert(30, "thirty");
t.insert(10, "ten");
t.insert(20, "twenty");

// ordered iteration — free
let keys: Vec<_> = t.keys().copied().collect();
assert_eq!(keys, vec![10, 20, 30]);

// range queries — the reason to pick a BTreeMap
let between: Vec<_> = t.range(15..=25).map(|(k, _)| *k).collect();
assert_eq!(between, vec![20]);

// neighbour lookups
assert_eq!(t.range(..20).next_back().map(|(k, _)| *k), Some(10));   // floor
assert_eq!(t.range(20..).next().map(|(k, _)| *k), Some(20));        // ceil
```

`BTreeMap` is a B-tree with 6–11 keys per node — far more cache-friendly than a
binary tree of pointers. Use it for:

- time-ordered events (range scan "last 5 minutes")
- interval lookups (floor/ceil)
- anything you print or serialise and want stable output

## A binary search tree, for the understanding

```rust
#[derive(Default)]
pub struct Bst<T> {
    root: Link<T>,
}

type Link<T> = Option<Box<Node<T>>>;

struct Node<T> {
    key: u64,
    value: T,
    left: Link<T>,
    right: Link<T>,
}

impl<T> Bst<T> {
    pub fn insert(&mut self, key: u64, value: T) {
        let mut cur = &mut self.root;
        loop {
            match cur {
                None => {
                    *cur = Some(Box::new(Node { key, value, left: None, right: None }));
                    return;
                }
                Some(node) if key < node.key => cur = &mut node.left,
                Some(node) if key > node.key => cur = &mut node.right,
                Some(node) => { node.value = value; return; }
            }
        }
    }

    pub fn get(&self, key: u64) -> Option<&T> {
        let mut cur = &self.root;
        while let Some(node) = cur {
            if key < node.key { cur = &node.left }
            else if key > node.key { cur = &node.right }
            else { return Some(&node.value) }
        }
        None
    }
}
```

This is the one place recursive `&mut` traversal works: `cur = &mut node.left`
inside a loop, because each step re-borrows a strictly smaller place.

> **Gotcha:** an unbalanced BST degrades to a linked list on sorted input — O(n)
> lookups. That is why the standard library ships a B-tree and why `HashMap` exists.

## Trie: prefix search and routing

```rust
use std::collections::HashMap;

#[derive(Default)]
pub struct Trie {
    children: HashMap<char, Trie>,
    terminal: bool,
}

impl Trie {
    pub fn insert(&mut self, word: &str) {
        let mut node = self;
        for c in word.chars() {
            node = node.children.entry(c).or_default();
        }
        node.terminal = true;
    }

    pub fn contains(&self, word: &str) -> bool {
        let mut node = self;
        for c in word.chars() {
            match node.children.get(&c) {
                Some(next) => node = next,
                None => return false,
            }
        }
        node.terminal
    }

    /// All words with this prefix — the router use case.
    pub fn with_prefix(&self, prefix: &str) -> Vec<String> {
        let mut node = self;
        for c in prefix.chars() {
            match node.children.get(&c) {
                Some(next) => node = next,
                None => return Vec::new(),
            }
        }
        let mut out = Vec::new();
        node.collect(prefix.to_string(), &mut out);
        out
    }

    fn collect(&self, prefix: String, out: &mut Vec<String>) {
        if self.terminal { out.push(prefix.clone()); }
        for (c, child) in &self.children {
            let mut p = prefix.clone();
            p.push(*c);
            child.collect(p, out);
        }
    }
}
```

This is the shape of an HTTP router's path trie and of every autocomplete.

## Interval trees: "which range contains this point?"

A booking calendar, a metrics query planner, a firewall rule set — all the same
problem. With sorted starts and a max-end per subtree you get O(log n). With a
`BTreeMap` and no augmentation you get O(log n) floor lookup plus a scan, which is
usually enough:

```rust
let mut by_start: std::collections::BTreeMap<u64, u64> = std::collections::BTreeMap::new();
by_start.insert(start, end);   // start -> end

// the interval containing `t` is a floor candidate or the one before it
if let Some((_, end)) = by_start.range(..=t).next_back() {
    if *end >= t { /* contains */ }
}
```

## Choosing

| Need | Use |
| --- | --- |
| ordered iteration | `BTreeMap` |
| range / floor / ceil | `BTreeMap` |
| prefix / autocomplete | trie |
| "which interval contains x" | augmented tree, or sorted starts |
| max/min with insertion | `BinaryHeap` |
| everything at once | `indexmap` (insertion order) or a custom arena |

## Exercises

1. Implement `Bst::delete` (the hard case: a node with two children).
2. Build a trie-based HTTP router: `insert("/api/users/:id", handler)` and `match_path`.
3. Use `BTreeMap` to answer "events in the last 5 minutes" over 1M timestamps and
   compare against a linear scan.

**Next:** [Heaps and priority queues](07-heaps.md)
