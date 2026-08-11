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
		// The pre-paint script in __root has already resolved the theme from
		// localStorage or the system preference, so read it back rather than
		// deciding a second time and risking the two disagreeing.
		setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
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
