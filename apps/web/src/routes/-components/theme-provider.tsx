import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Themes are token sets, not a light/dark boolean. Each one maps to the classes
 * that must sit on <html>: a palette class, plus `dark` when the palette is dark
 * so every `dark:` variant and the `.dark` token overrides come along with it.
 * Same shape as the recalio dashboard, so the two projects stay legible to each
 * other.
 */
const THEME_CLASSES = {
	cream: ["theme-cream"],
	paper: ["theme-paper"],
	solarized: ["theme-solarized"],
	light: [],
	dark: ["dark"],
	nord: ["theme-nord", "dark"],
	dracula: ["theme-dracula", "dark"],
	groove: ["theme-groove", "dark"],
} as const satisfies Record<string, readonly string[]>;

type Theme = keyof typeof THEME_CLASSES;

const THEME_ORDER = Object.keys(THEME_CLASSES) as Theme[];
const ALL_THEME_CLASSES = [...new Set(Object.values(THEME_CLASSES).flat())];
const DEFAULT_THEME: Theme = "cream";
const STORAGE_KEY = "plantifiles-theme";

function isTheme(value: string | null): value is Theme {
	return value !== null && value in THEME_CLASSES;
}

/** Applied here and, in the same shape, by the pre-paint script in `__root`. */
function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	const classes: readonly string[] = THEME_CLASSES[theme];
	root.classList.remove(...ALL_THEME_CLASSES);
	root.classList.add(...classes);
	root.style.colorScheme = classes.includes("dark") ? "dark" : "light";
}

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	themes: readonly Theme[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		// The pre-paint script already resolved and applied the theme, so read it
		// back rather than deciding a second time and risking the two disagreeing.
		const stored = localStorage.getItem(STORAGE_KEY);
		setTheme(isTheme(stored) ? stored : DEFAULT_THEME);
		setReady(true);
	}, []);

	useEffect(() => {
		if (!ready) return;
		applyTheme(theme);
		localStorage.setItem(STORAGE_KEY, theme);
	}, [ready, theme]);

	const value = useMemo(() => ({ theme, setTheme, themes: THEME_ORDER }), [theme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used within ThemeProvider.");
	return value;
}

export { DEFAULT_THEME, ThemeProvider, THEME_CLASSES, type Theme, useTheme };
