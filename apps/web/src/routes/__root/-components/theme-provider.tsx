import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY, type Theme } from "./theme-config";

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		try {
			const stored = localStorage.getItem(THEME_STORAGE_KEY);
			setTheme(isTheme(stored) ? stored : DEFAULT_THEME);
		} catch {
			// The default remains usable when storage is unavailable.
		}
		setReady(true);
	}, []);

	useEffect(() => {
		if (!ready) return;
		const dark = theme === "dark";
		document.documentElement.classList.toggle("dark", dark);
		document.documentElement.style.colorScheme = dark ? "dark" : "light";
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch {
			// The selected theme still applies for this session.
		}
	}, [ready, theme]);

	return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used within ThemeProvider.");
	return value;
}

export { ThemeProvider, useTheme };
