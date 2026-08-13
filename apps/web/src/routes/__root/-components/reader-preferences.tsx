import { createContext, useContext, useEffect, useMemo, useState } from "react";

const READER_FONTS = [
	{ id: "geist", label: "Geist", stack: "'Geist Variable', sans-serif" },
	{
		id: "system",
		label: "System",
		stack: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	},
	{ id: "lexend", label: "Lexend", stack: "'Lexend Variable', ui-sans-serif, sans-serif" },
	{ id: "literata", label: "Literata", stack: "'Literata Variable', Georgia, serif" },
	{ id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
	{
		id: "opendyslexic",
		label: "OpenDyslexic",
		stack: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
	},
] as const;

type ReaderFont = (typeof READER_FONTS)[number]["id"];

const SIZE_STEPS = ["15px", "16px", "17px", "18px", "20px"] as const;
const WIDTH_STEPS = ["640px", "768px", "896px"] as const;
const DEFAULT_FONT: ReaderFont = "geist";
const DEFAULT_SIZE_STEP = 1;
const DEFAULT_WIDTH_STEP = 1;
const FONT_STORAGE_KEY = "plantifiles-reader-font";
const SIZE_STORAGE_KEY = "plantifiles-reader-size-step";
const WIDTH_STORAGE_KEY = "plantifiles-reader-width-step";

const loadedReaderFonts = new Set<ReaderFont>(["geist", "system", "georgia"]);
const readerFontLoaders: Partial<Record<ReaderFont, () => Promise<unknown>>> = {
	lexend: () => import("@fontsource-variable/lexend/index.css"),
	literata: () => import("@fontsource-variable/literata/index.css"),
	opendyslexic: () => import("@fontsource/opendyslexic/latin.css"),
};

async function ensureReaderFontLoaded(font: ReaderFont) {
	if (loadedReaderFonts.has(font)) return;
	const loadFont = readerFontLoaders[font];
	if (!loadFont) return;
	await loadFont();
	loadedReaderFonts.add(font);
}

function isReaderFont(value: string | null): value is ReaderFont {
	return value !== null && READER_FONTS.some((font) => font.id === value);
}

function clampStep(value: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(0, Math.min(max, Math.trunc(value)));
}

function readStoredStep(key: string, max: number, fallback: number): number {
	const stored = localStorage.getItem(key);
	return stored === null ? fallback : clampStep(Number(stored), max, fallback);
}

type ReaderPreferencesContextValue = {
	font: ReaderFont;
	setFont: (font: ReaderFont) => void;
	sizeStep: number;
	setSizeStep: (step: number) => void;
	widthStep: number;
	setWidthStep: (step: number) => void;
	fontStack: string;
	fontSize: (typeof SIZE_STEPS)[number];
	maxWidth: (typeof WIDTH_STEPS)[number];
};

const ReaderPreferencesContext = createContext<ReaderPreferencesContextValue | null>(null);

function ReaderPreferencesProvider({ children }: { children: React.ReactNode }) {
	const [font, setFont] = useState<ReaderFont>(DEFAULT_FONT);
	const [sizeStep, setRawSizeStep] = useState(DEFAULT_SIZE_STEP);
	const [widthStep, setRawWidthStep] = useState(DEFAULT_WIDTH_STEP);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		try {
			const storedFont = localStorage.getItem(FONT_STORAGE_KEY);
			setFont(isReaderFont(storedFont) ? storedFont : DEFAULT_FONT);
			setRawSizeStep(readStoredStep(SIZE_STORAGE_KEY, SIZE_STEPS.length - 1, DEFAULT_SIZE_STEP));
			setRawWidthStep(readStoredStep(WIDTH_STORAGE_KEY, WIDTH_STEPS.length - 1, DEFAULT_WIDTH_STEP));
		} catch {
			// Defaults remain usable when storage is unavailable.
		}
		setReady(true);
	}, []);

	useEffect(() => {
		if (!ready) return;
		void ensureReaderFontLoaded(font).catch(() => undefined);
		try {
			localStorage.setItem(FONT_STORAGE_KEY, font);
			localStorage.setItem(SIZE_STORAGE_KEY, String(sizeStep));
			localStorage.setItem(WIDTH_STORAGE_KEY, String(widthStep));
		} catch {
			// The selected settings still apply for this session.
		}
	}, [font, ready, sizeStep, widthStep]);

	const value = useMemo<ReaderPreferencesContextValue>(
		() => ({
			font,
			setFont,
			sizeStep,
			setSizeStep: (step) => setRawSizeStep(clampStep(step, SIZE_STEPS.length - 1, DEFAULT_SIZE_STEP)),
			widthStep,
			setWidthStep: (step) => setRawWidthStep(clampStep(step, WIDTH_STEPS.length - 1, DEFAULT_WIDTH_STEP)),
			fontStack: READER_FONTS.find((option) => option.id === font)?.stack ?? READER_FONTS[0].stack,
			fontSize: SIZE_STEPS[sizeStep] ?? SIZE_STEPS[DEFAULT_SIZE_STEP],
			maxWidth: WIDTH_STEPS[widthStep] ?? WIDTH_STEPS[DEFAULT_WIDTH_STEP],
		}),
		[font, sizeStep, widthStep],
	);

	return <ReaderPreferencesContext.Provider value={value}>{children}</ReaderPreferencesContext.Provider>;
}

function useReaderPreferences(): ReaderPreferencesContextValue {
	const value = useContext(ReaderPreferencesContext);
	if (!value) throw new Error("useReaderPreferences must be used within ReaderPreferencesProvider.");
	return value;
}

export { ReaderPreferencesProvider, READER_FONTS, SIZE_STEPS, useReaderPreferences, WIDTH_STEPS };
