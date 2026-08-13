import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
	ALL_THEME_CLASSES,
	DEFAULT_THEME,
	getNextTheme,
	getThemeMetadata,
	isTheme,
	isThemeCycleShortcut,
	THEME_STORAGE_KEY,
	type Theme,
} from "./theme-config";

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(THEME_STORAGE_KEY);
		} catch {
			// Storage can be unavailable in privacy-restricted browser contexts.
		}
		setTheme(isTheme(stored) ? stored : DEFAULT_THEME);
		setReady(true);
	}, []);

	useEffect(() => {
		if (!ready) return;
		const root = document.documentElement;
		const { rootClasses } = getThemeMetadata(theme);
		root.classList.remove(...ALL_THEME_CLASSES);
		root.classList.add(...rootClasses);
		root.style.colorScheme = rootClasses.includes("dark") ? "dark" : "light";
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch {
			// The selected theme still applies for this session.
		}
	}, [ready, theme]);

	useEffect(() => {
		if (!ready) return;

		function cycleTheme(event: KeyboardEvent) {
			const target = event.target;
			const isEditable =
				target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
			if (isEditable || !isThemeCycleShortcut(event)) return;

			event.preventDefault();
			setTheme((current) => getNextTheme(current));
		}

		window.addEventListener("keydown", cycleTheme);
		return () => window.removeEventListener("keydown", cycleTheme);
	}, [ready]);

	const value = useMemo(() => ({ theme, setTheme }), [theme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used within ThemeProvider.");
	return value;
}

export { ThemeProvider, useTheme };
