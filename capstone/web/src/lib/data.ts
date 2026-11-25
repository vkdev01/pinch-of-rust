export type Trend = "up" | "down";

export type Metric = {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  hint: string;
};

export type PlanRow = {
  id: string;
  plan: string;
  accounts: number;
  mrr: number;
  share: number;
  color: "accent" | "success" | "warning" | "default";
};

export type UsageRow = {
  id: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
};

export type Invoice = {
  id: string;
  customer: string;
  plan: "Starter" | "Growth" | "Scale" | "Enterprise";
  amount: number;
  issued: string;
  due: string;
  status: "Paid" | "Pending" | "Overdue";
  owner: string;
  initials: string;
};

export type Account = {
  id: string;
  name: string;
  plan: string;
  mrr: number;
  seats: number;
  initials: string;
};

export type RevenuePoint = {
  month: string;
  mrr: number;
};

export const company = {
  name: "Northwind Analytics",
  workspace: "Northwind Analytics - Production",
  user: {
    name: "Ananya Rao",
    email: "ananya.rao@northwind.io",
    role: "Finance lead",
    initials: "AR",
  },
};

export const metrics: Metric[] = [
  {
    id: "mrr",
    label: "MRR",
    value: "$184,320",
    delta: "+6.2%",
    trend: "up",
    hint: "vs. $173,560 last month",
  },
  {
    id: "arr",
    label: "ARR (run-rate)",
    value: "$2.21M",
    delta: "+6.2%",
    trend: "up",
    hint: "Annualised from November MRR",
  },
  {
    id: "users",
    label: "Active users",
    value: "12,847",
    delta: "+3.4%",
    trend: "up",
    hint: "28-day rolling active seats",
  },
  {
    id: "churn",
    label: "Logo churn",
    value: "1.8%",
    delta: "-0.3 pts",
    trend: "up",
    hint: "Lower is better - 41 logos lost",
  },
  {
    id: "nrr",
    label: "Net revenue retention",
    value: "112%",
    delta: "+2.0 pts",
    trend: "up",
    hint: "Expansion offsetting downgrades",
  },
];

export const revenueTrend: RevenuePoint[] = [
  { month: "Jun", mrr: 128400 },
  { month: "Jul", mrr: 139800 },
  { month: "Aug", mrr: 148200 },
  { month: "Sep", mrr: 157450 },
  { month: "Oct", mrr: 173560 },
  { month: "Nov", mrr: 184320 },
];

export const plans: PlanRow[] = [
  { id: "starter", plan: "Starter", accounts: 4210, mrr: 18945, share: 10.3, color: "default" },
  { id: "growth", plan: "Growth", accounts: 1842, mrr: 61412, share: 33.3, color: "accent" },
  { id: "scale", plan: "Scale", accounts: 486, mrr: 54208, share: 29.4, color: "success" },
  { id: "enterprise", plan: "Enterprise", accounts: 58, mrr: 49755, share: 27.0, color: "warning" },
];

export const usage: UsageRow[] = [
  { id: "api", label: "API calls", used: 18_400_000, limit: 25_000_000, unit: "calls" },
  { id: "seats", label: "Active seats", used: 12_847, limit: 15_000, unit: "seats" },
  { id: "storage", label: "Event storage", used: 3.2, limit: 5, unit: "TB" },
  { id: "queries", label: "Warehouse queries", used: 742_000, limit: 1_000_000, unit: "queries" },
];

export const invoices: Invoice[] = [
  {
    id: "INV-2041",
    customer: "Acme Corp",
    plan: "Enterprise",
    amount: 4800,
    issued: "2026-11-01",
    due: "2026-11-30",
    status: "Paid",
    owner: "Priya Nair",
    initials: "AC",
  },
  {
    id: "INV-2040",
    customer: "Northwind Labs",
    plan: "Scale",
    amount: 1250,
    issued: "2026-11-03",
    due: "2026-12-03",
    status: "Pending",
    owner: "Rohit Menon",
    initials: "NL",
  },
  {
    id: "INV-2039",
    customer: "Globex Industries",
    plan: "Enterprise",
    amount: 12000,
    issued: "2026-10-15",
    due: "2026-11-14",
    status: "Overdue",
    owner: "Priya Nair",
    initials: "GI",
  },
  {
    id: "INV-2038",
    customer: "Initech Systems",
    plan: "Growth",
    amount: 780,
    issued: "2026-11-05",
    due: "2026-12-05",
    status: "Pending",
    owner: "Sana Qureshi",
    initials: "IS",
  },
  {
    id: "INV-2037",
    customer: "Umbrella Health",
    plan: "Scale",
    amount: 2450,
    issued: "2026-10-28",
    due: "2026-11-27",
    status: "Paid",
    owner: "Rohit Menon",
    initials: "UH",
  },
  {
    id: "INV-2036",
    customer: "Vandelay Exports",
    plan: "Starter",
    amount: 129,
    issued: "2026-11-08",
    due: "2026-12-08",
    status: "Paid",
    owner: "Sana Qureshi",
    initials: "VE",
  },
  {
    id: "INV-2035",
    customer: "Soylent Foods",
    plan: "Growth",
    amount: 940,
    issued: "2026-10-20",
    due: "2026-11-19",
    status: "Overdue",
    owner: "Priya Nair",
    initials: "SF",
  },
];

export const accounts: Account[] = [
  { id: "acme", name: "Acme Corp", plan: "Enterprise", mrr: 4800, seats: 412, initials: "AC" },
  { id: "globex", name: "Globex Industries", plan: "Enterprise", mrr: 12000, seats: 640, initials: "GI" },
  { id: "umbrella", name: "Umbrella Health", plan: "Scale", mrr: 2450, seats: 208, initials: "UH" },
  { id: "initech", name: "Initech Systems", plan: "Growth", mrr: 780, seats: 96, initials: "IS" },
  { id: "northwind-labs", name: "Northwind Labs", plan: "Scale", mrr: 1250, seats: 134, initials: "NL" },
];

export const dateRanges = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
] as const;

export type DateRangeId = (typeof dateRanges)[number]["id"];

export const invoiceStatuses = ["Paid", "Pending", "Overdue"] as const;
