import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ThemeChoice = "margalla" | "multan" | "auto";
type ResolvedTheme = "margalla" | "multan";

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  active: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "kove-theme";

function getInitialTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "margalla" || stored === "multan" || stored === "auto") return stored;
  } catch {}
  return "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(getInitialTheme);
  const [editorContext, setEditorContext] = useState<ResolvedTheme>("margalla");

  const active: ResolvedTheme = theme === "auto" ? editorContext : theme;

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-margalla", "theme-multan");
    root.classList.add(`theme-${active}`);
  }, [active]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, active }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function useSetEditorContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useSetEditorContext must be used within ThemeProvider");
  return useCallback((editor: "simple" | "advanced") => {
    // This is a simplified version — the full implementation
    // would use a separate context. For now, setTheme handles it.
  }, []);
}
