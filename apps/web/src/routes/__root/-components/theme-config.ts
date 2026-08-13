type ThemeMetadata = {
	name: string;
	label: string;
	rootClasses: readonly string[];
	previewClasses: string;
};

const THEMES = [
	{ name: "cream", label: "Cream", rootClasses: ["theme-cream"], previewClasses: "theme-cream" },
	{ name: "paper", label: "Paper", rootClasses: ["theme-paper"], previewClasses: "theme-paper" },
	{
		name: "solarized",
		label: "Solarized",
		rootClasses: ["theme-solarized"],
		previewClasses: "theme-solarized",
	},
	{ name: "light", label: "Light", rootClasses: [], previewClasses: "theme-preview-light" },
	{ name: "dark", label: "Dark", rootClasses: ["dark"], previewClasses: "dark" },
	{ name: "nord", label: "Nord", rootClasses: ["theme-nord", "dark"], previewClasses: "theme-nord dark" },
	{
		name: "dracula",
		label: "Dracula",
		rootClasses: ["theme-dracula", "dark"],
		previewClasses: "theme-dracula dark",
	},
	{
		name: "groove",
		label: "Gruvbox",
		rootClasses: ["theme-groove", "dark"],
		previewClasses: "theme-groove dark",
	},
] as const satisfies readonly ThemeMetadata[];

type Theme = (typeof THEMES)[number]["name"];

const DEFAULT_THEME: Theme = "cream";
const THEME_STORAGE_KEY = "plantifiles-theme";
const THEME_CYCLE_ARIA_KEYSHORTCUTS = "Control+Shift+L Meta+Shift+L";
const THEME_CYCLE_SHORTCUT_LABEL = "Ctrl/⌘+Shift+L";
const ALL_THEME_CLASSES = THEMES.flatMap(({ rootClasses }) => rootClasses).filter(
	(className, index, classes) => classes.indexOf(className) === index,
);

function isTheme(value: string | null): value is Theme {
	return value !== null && THEMES.some((theme) => theme.name === value);
}

function assertTheme(value: string): asserts value is Theme {
	if (!isTheme(value)) throw new Error(`Unknown theme: ${value}`);
}

function getThemeMetadata(theme: Theme): ThemeMetadata {
	const metadata = THEMES.find((candidate) => candidate.name === theme);
	if (!metadata) throw new Error(`Missing metadata for theme: ${theme}`);
	return metadata;
}

function getNextTheme(theme: Theme): Theme {
	const index = THEMES.findIndex((candidate) => candidate.name === theme);
	if (index === -1) throw new Error(`Cannot cycle unknown theme: ${theme}`);
	const nextTheme = THEMES[(index + 1) % THEMES.length];
	if (!nextTheme) throw new Error("Cannot cycle an empty theme list.");
	return nextTheme.name;
}

function isThemeCycleShortcut(event: {
	altKey: boolean;
	ctrlKey: boolean;
	defaultPrevented: boolean;
	key: string;
	metaKey: boolean;
	shiftKey: boolean;
}): boolean {
	return (
		!event.defaultPrevented &&
		!event.altKey &&
		event.shiftKey &&
		(event.ctrlKey || event.metaKey) &&
		event.key.toLowerCase() === "l"
	);
}

function createThemePrepaintScript(): string {
	const themeClasses = Object.fromEntries(THEMES.map(({ name, rootClasses }) => [name, rootClasses]));
	return `try{var m=${JSON.stringify(themeClasses)},t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(!Object.prototype.hasOwnProperty.call(m,t))t=${JSON.stringify(DEFAULT_THEME)};var c=m[t],r=document.documentElement;if(c.length)r.classList.add.apply(r.classList,c);r.style.colorScheme=c.indexOf("dark")>-1?"dark":"light"}catch(e){}`;
}

const THEME_PREPAINT_SCRIPT = createThemePrepaintScript();

export {
	ALL_THEME_CLASSES,
	assertTheme,
	DEFAULT_THEME,
	getNextTheme,
	getThemeMetadata,
	isTheme,
	isThemeCycleShortcut,
	THEME_CYCLE_ARIA_KEYSHORTCUTS,
	THEME_CYCLE_SHORTCUT_LABEL,
	THEME_PREPAINT_SCRIPT,
	THEME_STORAGE_KEY,
	THEMES,
	type Theme,
};
