# 03 · Linked structures, and why you rarely want them

Every Rust beginner writes a linked list and meets the borrow checker. The lesson
is not "how to fight it" — it is that **indices in a `Vec` are the idiomatic
linked structure in Rust**.

## The naive attempt

```rust
struct Node { value: i32, next: Option<Box<Node>> }

struct List { head: Option<Box<Node>> }

impl List {
    fn push(&mut self, value: i32) {
        let node = Box::new(Node { value, next: self.head.take() });
        self.head = Some(node);
    }

    fn pop(&mut self) -> Option<i32> {
        let head = self.head.take()?;
        self.head = head.next;
        Some(head.value)
    }
}
```

This compiles and is fine for a stack. What does *not* compile is the version you
probably wanted:

```rust
// does not compile: cannot borrow `self.head` as mutable more than once
fn last_mut(&mut self) -> &mut Node {
    let mut cur = &mut self.head;
    while let Some(node) = cur { cur = &mut node.next; }
    // ...
}
```

Recursive `&mut` traversal needs `if let` re-borrowing, which the borrow checker
cannot express. This is where people reach for `Rc<RefCell<_>>` and lose both
performance and sanity.

## The idiomatic answer: an arena

```rust
/// A doubly linked list in a Vec. No Rc, no RefCell, no leaks, cache-friendly.
pub struct Arena {
    nodes: Vec<Slot>,
    free: Vec<usize>,
    head: Option<usize>,
    tail: Option<usize>,
}

#[derive(Clone)]
struct Slot {
    value: i32,
    prev: Option<usize>,
    next: Option<usize>,
    alive: bool,
}

impl Arena {
    pub fn new() -> Self {
        Self { nodes: Vec::new(), free: Vec::new(), head: None, tail: None }
    }

    pub fn push_back(&mut self, value: i32) -> usize {
        let idx = self.alloc(Slot { value, prev: self.tail, next: None, alive: true });
        match self.tail {
            Some(t) => self.nodes[t].next = Some(idx),
            None => self.head = Some(idx),
        }
        self.tail = Some(idx);
        idx
    }

    pub fn unlink(&mut self, idx: usize) {
        let (prev, next) = {
            let n = &self.nodes[idx];
            (n.prev, n.next)
        };
        match prev { Some(p) => self.nodes[p].next = next, None => self.head = next }
        match next { Some(n) => self.nodes[n].prev = prev, None => self.tail = prev }
        self.nodes[idx].alive = false;
        self.free.push(idx);
    }

    fn alloc(&mut self, slot: Slot) -> usize {
        match self.free.pop() {
            Some(i) => { self.nodes[i] = slot; i }
            None => { self.nodes.push(slot); self.nodes.len() - 1 }
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = i32> + '_ {
        let mut cur = self.head;
        std::iter::from_fn(move || {
            let i = cur?;
            let n = &self.nodes[i];
            cur = n.next;
            Some(n.value)
        })
    }
}
```

Why this is better than `Rc<RefCell<Node>>`:

| | Arena | `Rc<RefCell>` |
| --- | --- | --- |
| Allocation per node | zero after warm-up | one + refcount |
| Memory layout | contiguous | scattered |
| Borrow errors | compile time | runtime panic |
| Cycles | impossible | leak unless `Weak` |
| Unlink cost | O(1) | O(1) but with drops |

This is exactly how real systems do it: `petgraph` uses indices, `slotmap` exists
for the general case, and every game engine uses handles, not pointers.

## When a real linked list is right

- You are writing an allocator or a kernel structure and need intrusive lists.
- You need stable addresses for nodes while the container grows (`LinkedList`
  guarantees this; `Vec` does not).
- You are interfacing with C code that hands you pointers.

For everything else — an LRU cache, an entity list, a graph — use indices.

## A tiny `LinkedList` you can still use

`std::collections::LinkedList` exists. It is a doubly linked list with O(1) splice
at both ends and O(n) everything else. Its own documentation says to prefer `Vec`
or `VecDeque` in almost all cases, because of cache behaviour.

## Exercises

1. Implement the arena above, then add `insert_before(idx, value)`.
2. Write an LRU cache using a `HashMap<K, usize>` plus the arena, and verify
   recency order after 10,000 operations.
3. Measure iteration over 100k nodes: `LinkedList<i32>` vs `Vec<i32>` vs the arena.
   Explain the gap in cache misses.

**Next:** [Stacks, queues and ring buffers](04-stacks-queues.md)
