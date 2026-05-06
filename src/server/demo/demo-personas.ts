/**
 * Synthetic cast for demo: matches `data/opportunities.csv`, `scripts/seed-demo-notes.ts`,
 * and `docs/demo-script.md`. Fictitious only.
 */
export type DemoOrgGroup =
  | "sa_leadership"
  | "sa_field"
  | "ae"
  | "sales_leadership"
  | "other";

export interface DemoPersona {
  email: string;
  name: string;
  title: string;
  /** Bucket for the org-chart layout on the demo login page. */
  orgGroup: DemoOrgGroup;
  /** One line: what to show in risk / notes when impersonating this user. */
  focus: string;
  /** Sort order within orgGroup (lower first). */
  order: number;
}

/** Full synthetic roster — use with AUTH_MODE=demo; trim with DEMO_AUTH_EMAILS if needed. */
export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    email: "kevin.qadri@elastic.co",
    name: "Kevin Qadri",
    title: "SA VP — Head of pre-sales",
    orgGroup: "sa_leadership",
    focus: "Q2 forecast roll-up; executive reviews",
    order: 0,
  },
  {
    email: "pat.morgan@elastic.co",
    name: "Pat Morgan",
    title: "SA Director",
    orgGroup: "sa_leadership",
    focus: "Covers Ed + Marisa; director-level risk rollup",
    order: 1,
  },
  {
    email: "ed.salazar@elastic.co",
    name: "Ed Salazar",
    title: "SA Manager (AMER)",
    orgGroup: "sa_leadership",
    focus: "Steve / Jordan / Morgan patch + escalation queue",
    order: 2,
  },
  {
    email: "marisa.chen@elastic.co",
    name: "Marisa Chen",
    title: "SA Manager (AMER, peer)",
    orgGroup: "sa_leadership",
    focus: "Peer manager (Helix + Stratum pursuit overlap in demo)",
    order: 3,
  },
  {
    email: "steve.leung@elastic.co",
    name: "Steve Leung",
    title: "Solutions Architect",
    orgGroup: "sa_field",
    focus: "Aurora Health, Lattice Insurance, Nimbus Cloud",
    order: 0,
  },
  {
    email: "jordan.kim@elastic.co",
    name: "Jordan Kim",
    title: "Solutions Architect",
    orgGroup: "sa_field",
    focus: "Helix Robotics, Stratum Networks",
    order: 1,
  },
  {
    email: "morgan.patel@elastic.co",
    name: "Morgan Patel",
    title: "Solutions Architect",
    orgGroup: "sa_field",
    focus: "Polaris Energy, Redwood Logistics",
    order: 2,
  },
  {
    email: "priya.shah@elastic.co",
    name: "Priya Shah",
    title: "Account Executive",
    orgGroup: "ae",
    focus: "Paired with Steve — Aurora, Lattice, Nimbus",
    order: 0,
  },
  {
    email: "marcus.li@elastic.co",
    name: "Marcus Li",
    title: "Account Executive",
    orgGroup: "ae",
    focus: "Paired with Jordan — Helix, Stratum",
    order: 1,
  },
  {
    email: "nina.ortega@elastic.co",
    name: "Nina Ortega",
    title: "Account Executive",
    orgGroup: "ae",
    focus: "Paired with Morgan — Polaris, Redwood",
    order: 2,
  },
  {
    email: "regan.holt@elastic.co",
    name: "Regan Holt",
    title: "Sales AVP",
    orgGroup: "sales_leadership",
    focus: "RVP rollup — AMER + EMEA",
    order: 0,
  },
  {
    email: "dana.fields@elastic.co",
    name: "Dana Fields",
    title: "Sales RVP — AMER",
    orgGroup: "sales_leadership",
    focus: "Regional pipeline (aligned to demo opps in CSV)",
    order: 1,
  },
  {
    email: "ines.ortega@elastic.co",
    name: "Ines Ortega",
    title: "Sales RVP — EMEA",
    orgGroup: "sales_leadership",
    focus: "EMEA lens (sparse opps in seed — good empty-regional demo)",
    order: 2,
  },
];

const byEmail = new Map(DEMO_PERSONAS.map((p) => [p.email.toLowerCase(), p]));

export function getDemoPersona(email: string): DemoPersona | undefined {
  return byEmail.get(email.trim().toLowerCase());
}

const GROUP_LABELS: Record<DemoOrgGroup, string> = {
  sa_leadership: "Pre-sales leadership",
  sa_field: "Solutions Architects (field)",
  ae: "Account Executives",
  sales_leadership: "Sales leadership",
  other: "Other",
};

export interface DemoOrgSection {
  id: DemoOrgGroup;
  label: string;
  personas: DemoPersona[];
}

/** Grouped personas for the demo login org chart (order within group preserved). */
export function buildDemoOrgSections(personas: DemoPersona[]): DemoOrgSection[] {
  const order: DemoOrgGroup[] = [
    "sa_leadership",
    "sa_field",
    "ae",
    "sales_leadership",
    "other",
  ];
  const map = new Map<DemoOrgGroup, DemoPersona[]>();
  for (const g of order) map.set(g, []);
  for (const p of personas) {
    const list = map.get(p.orgGroup) ?? map.get("other")!;
    list.push(p);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  return order
    .map((id) => {
      const list = map.get(id) ?? [];
      if (!list.length) return null;
      return { id, label: GROUP_LABELS[id], personas: list };
    })
    .filter((s): s is DemoOrgSection => s !== null);
}
