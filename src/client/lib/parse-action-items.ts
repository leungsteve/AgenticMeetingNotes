/** Parse Granola-style action item bullets into structured rows. */
export function parseActionItemsFromRaw(raw: string | null | undefined): Array<{
  description: string;
  owner: string;
  due_date: string;
  status: string;
}> {
  if (!raw?.trim()) return [];
  const out: Array<{ description: string; owner: string; due_date: string; status: string }> = [];
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t.startsWith("-")) continue;
    const m = t.match(
      /^-\s*\[\s*([ xX])\s*\]\s*(.+?)(?:\s*—\s*\*\*Owner:\*\*\s*([^|]+))?(?:\s*\|\s*\*\*Due:\*\*\s*(.+))?$/,
    );
    if (!m) continue;
    out.push({
      description: m[2].trim(),
      owner: (m[3] ?? "").trim(),
      due_date: (m[4] ?? "").trim() || "TBD",
      status: m[1].toLowerCase() === "x" ? "done" : "open",
    });
  }
  return out;
}
