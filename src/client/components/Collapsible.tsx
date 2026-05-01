import type { ReactNode } from "react";
import { useState } from "react";

const BADGE_CLS: Record<string, string> = {
  Recommended:
    "rounded px-1.5 py-px text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
  Optional:
    "rounded px-1.5 py-px text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
};

export default function Collapsible({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge && BADGE_CLS[badge] ? (
            <span className={BADGE_CLS[badge]}>{badge}</span>
          ) : null}
        </span>
        <span className="text-slate-400 dark:text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">{children}</div> : null}
    </div>
  );
}
