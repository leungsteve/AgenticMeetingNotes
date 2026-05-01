import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDom(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Three-way theme preference (light / dark / system) persisted to
 * `localStorage["theme"]`. The matching no-flash boot script in
 * `src/client/index.html` reads the same key so the first paint is the
 * right color.
 *
 * Returns the *resolved* boolean (`isDark`) plus the user's *preference*
 * so the toggle UI can show "system" as a distinct option.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored());
  const [isDark, setIsDark] = useState<boolean>(() => {
    const p = readStored();
    return p === "dark" || (p === "system" && systemPrefersDark());
  });

  useEffect(() => {
    applyDom(preference);
    setIsDark(preference === "dark" || (preference === "system" && systemPrefersDark()));
  }, [preference]);

  // Track OS-level changes when the user has chosen "system".
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyDom("system");
      setIsDark(mql.matches);
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode etc.
    }
    setPreferenceState(next);
  }, []);

  const toggle = useCallback(() => {
    setPreference(isDark ? "light" : "dark");
  }, [isDark, setPreference]);

  return { preference, isDark, setPreference, toggle };
}
