# 08 · Graphs

A graph in Rust is not a tree of boxes — it is an index into a `Vec`. Once you
accept that, everything becomes simple and fast.

## Representation

```rust
/// Adjacency list: one Vec per node, edges as (neighbour, weight).
pub struct Graph {
    pub adj: Vec<Vec<(u32, u64)>>,
}

impl Graph {
    pub fn new(n: usize) -> Self { Self { adj: vec![Vec::new(); n] } }

    pub fn add_edge(&mut self, a: u32, b: u32, w: u64) {
        self.adj[a as usize].push((b, w));
        self.adj[b as usize].push((a, w));      // omit for a directed graph
    }
}
```

| Representation | Memory | Iterate neighbours | Edge lookup |
| --- | --- | --- | --- |
| adjacency list | O(V+E) | O(deg) | O(deg) |
| adjacency matrix | O(V²) | O(V) | O(1) |
| edge list | O(E) | O(E) | O(E) |

Adjacency list unless V is small and dense.

## BFS: shortest path in an unweighted graph

```rust
use std::collections::VecDeque;

pub fn bfs(adj: &[Vec<(u32, u64)>], start: u32) -> Vec<i32> {
    let mut dist = vec![-1i32; adj.len()];
    let mut q = VecDeque::new();

    dist[start as usize] = 0;
    q.push_back(start);

    while let Some(u) = q.pop_front() {
        for &(v, _) in &adj[u as usize] {
            if dist[v as usize] == -1 {
                dist[v as usize] = dist[u as usize] + 1;
                q.push_back(v);
            }
        }
    }
    dist
}
```

`VecDeque` + a `visited`/distance array is the entire algorithm. BFS gives the
fewest-hops path; use Dijkstra when edges have weights.

## DFS without recursion

Deep graphs overflow the stack. An explicit stack is the safe version:

```rust
pub fn dfs_order(adj: &[Vec<(u32, u64)>], start: u32) -> Vec<u32> {
    let mut seen = vec![false; adj.len()];
    let mut stack = vec![start];
    let mut order = Vec::new();

    while let Some(u) = stack.pop() {
        if std::mem::replace(&mut seen[u as usize], true) { continue; }
        order.push(u);
        for &(v, _) in adj[u as usize].iter().rev() {
            if !seen[v as usize] { stack.push(v); }
        }
    }
    order
}
```

Rust has no guaranteed tail-call optimisation, so "recursion is fine" is not true
for graphs with 100k nodes.

## Topological sort — dependency resolution

Cargo, `systemd`, and every migration runner do this.

```rust
use std::collections::VecDeque;

/// Kahn's algorithm. Returns None if there is a cycle.
pub fn topo_sort(adj: &[Vec<usize>]) -> Option<Vec<usize>> {
    let n = adj.len();
    let mut indeg = vec![0usize; n];
    for edges in adj {
        for &v in edges { indeg[v] += 1; }
    }

    let mut q: VecDeque<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    let mut out = Vec::with_capacity(n);

    while let Some(u) = q.pop_front() {
        out.push(u);
        for &v in &adj[u] {
            indeg[v] -= 1;
            if indeg[v] == 0 { q.push_back(v); }
        }
    }

    (out.len() == n).then_some(out)
}
```

A cycle is a dependency loop, and `None` is exactly the error you want to report.

## Union-find — connected components and cycle detection

```rust
pub struct Dsu { parent: Vec<usize>, rank: Vec<u8> }

impl Dsu {
    pub fn new(n: usize) -> Self { Self { parent: (0..n).collect(), rank: vec![0; n] } }

    pub fn find(&mut self, mut x: usize) -> usize {
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]];   // path halving
            x = self.parent[x];
        }
        x
    }

    /// Returns false if they were already connected (i.e. this edge closes a cycle).
    pub fn union(&mut self, a: usize, b: usize) -> bool {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra == rb { return false; }
        match self.rank[ra].cmp(&self.rank[rb]) {
            std::cmp::Ordering::Less => self.parent[ra] = rb,
            std::cmp::Ordering::Greater => self.parent[rb] = ra,
            std::cmp::Ordering::Equal => { self.parent[rb] = ra; self.rank[ra] += 1; }
        }
        true
    }
}
```

Nearly O(1) per operation, no allocation, and it is the correct way to build a
minimum spanning tree or detect a cycle in an undirected graph.

## Where graphs run in production

| Problem | Algorithm |
| --- | --- |
| build dependency order | topological sort |
| deploy ordering, rollback plan | topological sort |
| shortest route in a service mesh | Dijkstra / A* |
| "which services does this change touch" | BFS on the call graph |
| duplicate detection / clustering | union-find |
| package resolution | SAT or topological + constraints |

## Exercises

1. Implement Dijkstra on the `Graph` type and test it against a hand-computed graph.
2. Use `topo_sort` to order a fake build graph and detect a cycle.
3. Implement union-find and count connected components in a 1M-edge random graph.

**Next:** [Sorting and selection](09-sorting.md)
