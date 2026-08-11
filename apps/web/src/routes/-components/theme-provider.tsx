import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<Theme>("light");
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem("plantifiles-theme") as Theme | null;
		const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
		setTheme(initial);
		setReady(true);
	}, []);

	useEffect(() => {
		if (!ready) return;
		document.documentElement.classList.toggle("dark", theme === "dark");
		localStorage.setItem("plantifiles-theme", theme);
	}, [ready, theme]);

	const value = useMemo(() => ({ theme, setTheme }), [theme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used within ThemeProvider.");
	return value;
}

export { ThemeProvider, useTheme };
