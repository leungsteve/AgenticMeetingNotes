import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboboxOption {
  value: string;
  label?: string;
  hint?: string;
}

export interface ComboboxProps {
  /** Current value (free-text or any option's `value`). */
  value: string;
  /** Available suggestions; users may also type something not on this list. */
  options: ComboboxOption[] | string[];
  /** Fires whenever the input value changes (typed or selected). */
  onChange: (next: string) => void;
  /** Placeholder when empty. */
  placeholder?: string;
  /** Optional small label rendered above the input. */
  label?: string;
  /** Show an "All / clear" sentinel at the top of the dropdown. */
  allowClear?: boolean;
  /** Label for the clear sentinel; default "All". */
  clearLabel?: string;
  /** Disable the field. */
  disabled?: boolean;
  /** Optional id passthrough. */
  id?: string;
  className?: string;
}

function normalizeOptions(opts: ComboboxOption[] | string[]): ComboboxOption[] {
  return opts.map((o) => (typeof o === "string" ? { value: o, label: o } : { ...o, label: o.label ?? o.value }));
}

/**
 * Typeable + autocomplete combo input. Useful when:
 *   - the value space is well-known (e.g. accounts, managers in the spine), and
 *   - the user might still want to type a free-text value the suggestion list
 *     doesn't cover (e.g. an account that was just created).
 *
 * Keyboard: ArrowUp/Down moves the highlight, Enter selects, Esc closes.
 */
export default function Combobox({
  value,
  options,
  onChange,
  placeholder,
  label,
  allowClear = false,
  clearLabel = "All",
  disabled,
  id,
  className,
}: ComboboxProps) {
  const reactId = useId();
  const inputId = id ?? `combobox-${reactId}`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Tracks whether the user has typed since opening the dropdown. We only
  // apply typeahead filtering after they've started typing — clicking into a
  // field that already has a value should still show every option, not just
  // the row matching the persisted selection.
  const [typing, setTyping] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const normalized = useMemo(() => normalizeOptions(options), [options]);

  const filtered = useMemo(() => {
    if (!typing) return normalized;
    const q = value.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((o) => {
      const blob = `${o.value} ${o.label ?? ""} ${o.hint ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [normalized, value, typing]);

  useEffect(() => {
    if (!open) {
      setTyping(false);
      return;
    }
    function onClickAway(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClickAway);
    return () => window.removeEventListener("mousedown", onClickAway);
  }, [open]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        onChange(filtered[highlight].value);
        setOpen(false);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      {label ? (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
        </label>
      ) : null}
      <div className="relative mt-1">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setTyping(true);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKey}
          className={`w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-7 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700`}
        />
        <button
          type="button"
          aria-label="Toggle suggestions"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {open && (filtered.length > 0 || allowClear) ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40"
        >
          {allowClear ? (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                {clearLabel}
              </button>
            </li>
          ) : null}
          {filtered.map((o, i) => {
            const isHighlighted = i === highlight;
            const isSelected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left ${
                    isHighlighted ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/60"
                  } ${isSelected ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"}`}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{o.hint}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && !allowClear ? (
            <li className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500">
              No matches — press Enter to keep typing.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
