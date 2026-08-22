type Theme = "sprout" | "dark";

const DEFAULT_THEME: Theme = "sprout";
const THEME_STORAGE_KEY = "plantifiles-theme";

function isTheme(value: string | null): value is Theme {
	return value === "sprout" || value === "dark";
}

const THEME_PREPAINT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),d=t==="dark",r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}`;

export { DEFAULT_THEME, isTheme, THEME_PREPAINT_SCRIPT, THEME_STORAGE_KEY, type Theme };
