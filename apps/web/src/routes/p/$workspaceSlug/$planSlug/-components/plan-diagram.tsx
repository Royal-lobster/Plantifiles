import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@plantifiles/ui/components/dialog";
import { cn } from "@plantifiles/ui/lib/utils";
import { Maximize2 } from "lucide-react";
import type { Mermaid } from "mermaid";
import type { ReactElement, ReactNode } from "react";
import { isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePlanRender } from "./plan-render-context";

let mermaidPromise: Promise<Mermaid> | undefined;

function loadMermaid(): Promise<Mermaid> | undefined {
	if (import.meta.env.SSR) return undefined;
	// The public package entry is Mermaid's core build: it keeps each diagram
	// implementation behind its own dynamic import. Share that browser-only
	// boundary across the inline figure and the lightbox.
	mermaidPromise ??= import("mermaid").then(
		({ default: mermaid }) => mermaid,
		(error: unknown) => {
			mermaidPromise = undefined;
			throw error;
		},
	);
	return mermaidPromise;
}

function reactNodeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(reactNodeText).join("");
	if (isValidElement(node)) return reactNodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
	return "";
}

/**
 * Mermaid rejects OKLCH, and every token in this theme is OKLCH, so colours are
 * pushed through a one-pixel canvas to come back as rgb().
 */
function mermaidColor(value: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext("2d");
	if (!context) return value;
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const channels = context.getImageData(0, 0, 1, 1).data;
	const red = channels[0] ?? 0;
	const green = channels[1] ?? 0;
	const blue = channels[2] ?? 0;
	const alpha = channels[3] ?? 255;
	return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function MermaidFigure({ chart, className }: { chart: string; className?: string }) {
	const reactId = useId();
	const id = useMemo(() => `plantifiles-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`, [reactId]);
	const [svg, setSvg] = useState<string>();
	const [error, setError] = useState<string>();
	const [rootClassSignature, setRootClassSignature] = useState<string>();
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = document.documentElement;
		const update = () => setRootClassSignature(root.className);
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (rootClassSignature === undefined) return;
		let active = true;
		void (async () => {
			try {
				const mermaid = await loadMermaid();
				if (!mermaid) return;
				const styles = getComputedStyle(document.documentElement);
				const theme = rootClassSignature.split(/\s+/).includes("dark") ? "dark" : "light";
				const token = (name: string) => mermaidColor(styles.getPropertyValue(name).trim());
				const surface = token("--background");
				const ink = token("--foreground");
				const edge = token("--diagram-edge");
				const node = token("--diagram-node");
				const quiet = token("--muted");
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: "strict",
					theme: "base",
					fontFamily: styles.getPropertyValue("--font-sans").trim() || "sans-serif",
					/* The base theme derives every colour it is not given by rotating the
					   primary hue, which turns a green product's edge labels magenta. Give
					   it the whole palette from the tokens instead. */
					themeVariables: {
						background: surface,
						mainBkg: node,
						primaryColor: node,
						primaryTextColor: ink,
						primaryBorderColor: edge,
						secondaryColor: quiet,
						secondaryTextColor: ink,
						secondaryBorderColor: edge,
						tertiaryColor: quiet,
						tertiaryTextColor: ink,
						tertiaryBorderColor: edge,
						lineColor: edge,
						textColor: ink,
						edgeLabelBackground: surface,
						labelBackgroundColor: surface,
						noteBkgColor: quiet,
						noteTextColor: ink,
						noteBorderColor: edge,
						clusterBkg: quiet,
						clusterBorder: edge,
						titleColor: ink,
					},
				});
				const rendered = await mermaid.render(`${id}-${theme}`, chart);
				if (active) {
					setSvg(rendered.svg);
					setError(undefined);
				}
			} catch (caught) {
				if (active) setError(caught instanceof Error ? caught.message : String(caught));
			}
		})();
		return () => {
			active = false;
		};
	}, [chart, id, rootClassSignature]);
	useEffect(() => {
		if (!svg || !rootRef.current) return;
		const parsed = new DOMParser().parseFromString(svg, "text/html");
		const svgElement = parsed.querySelector("svg");
		if (!svgElement) {
			setError("Mermaid returned invalid SVG.");
			return;
		}
		for (const script of svgElement.querySelectorAll("script")) script.remove();
		for (const element of [svgElement, ...svgElement.querySelectorAll("*")]) {
			for (const attribute of [...element.attributes]) {
				const name = attribute.name.toLowerCase();
				if (
					name.startsWith("on") ||
					((name === "href" || name === "xlink:href") && /^\s*javascript:/i.test(attribute.value))
				) {
					element.removeAttribute(attribute.name);
				}
			}
		}
		rootRef.current.replaceChildren(document.importNode(svgElement, true));
	}, [svg]);
	if (error) return <pre className="overflow-x-auto p-4 text-destructive text-xs">{error}</pre>;
	if (!svg) return <pre className="overflow-x-auto p-4 font-mono text-muted-foreground text-xs">{chart}</pre>;
	return <div ref={rootRef} className={cn("flex justify-center", className)} />;
}

function DiagramLightbox({
	chart,
	figure,
	lang,
}: {
	chart: string;
	figure: number | undefined;
	lang: "mermaid" | "d2";
}) {
	/* The primitive caps itself at sm:max-w-md, so the override has to carry the
	   same breakpoint or it loses at every width above mobile. */
	return (
		<DialogContent className="flex h-[88vh] w-[calc(100%-2rem)] max-w-[min(96vw,80rem)] flex-col gap-0 p-0 sm:max-w-[min(96vw,80rem)]">
			<DialogTitle className="border-b border-foreground/[0.06] px-4 py-3 pr-12 label-eyebrow text-foreground">
				{figure === undefined ? "Diagram" : `Fig. ${figure}`}
			</DialogTitle>
			<div className="flex-1 overflow-auto bg-muted/20 p-6">
				{lang === "mermaid" ? (
					<MermaidFigure chart={chart} className="[&_svg]:h-auto [&_svg]:min-w-[48rem]" />
				) : (
					<pre className="font-mono text-sm">{chart}</pre>
				)}
			</div>
		</DialogContent>
	);
}

function Diagram({ lang, blockKey, children }: { lang: "mermaid" | "d2"; blockKey?: string; children?: ReactNode }) {
	const { figureNumbers } = usePlanRender();
	const chart = reactNodeText(children).trim();
	const figure = blockKey ? figureNumbers[blockKey] : undefined;
	return (
		<figure className="group/diagram">
			<Dialog>
				<div className="relative overflow-hidden surface-card p-6 transition-shadow hover:ring-brand-ink/40 focus-within:ring-brand-ink/40">
					{lang === "mermaid" ? (
						<MermaidFigure chart={chart} />
					) : (
						<pre className="overflow-x-auto font-mono text-sm">{chart}</pre>
					)}
					<DialogTrigger asChild>
						<button
							type="button"
							aria-label={figure === undefined ? "Enlarge diagram" : `Enlarge figure ${figure}`}
							className="absolute inset-0 cursor-zoom-in rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset"
						>
							<span className="sr-only">{figure === undefined ? "Enlarge diagram" : `Enlarge figure ${figure}`}</span>
						</button>
					</DialogTrigger>
					<span className="pointer-events-none absolute top-2.5 right-2.5 flex items-center gap-1 rounded-xl bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10 opacity-0 transition-opacity group-hover/diagram:opacity-100 group-focus-within/diagram:opacity-100">
						<Maximize2 className="size-3" /> zoom
					</span>
				</div>
				<DiagramLightbox chart={chart} figure={figure} lang={lang} />
			</Dialog>
			<figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4">
				{figure !== undefined && <span className="label-eyebrow">Fig. {figure}</span>}
				<details className="min-w-0 flex-1">
					<summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">
						View source
					</summary>
					<div className="[&_pre]:my-2 [&_pre]:text-xs">{children}</div>
				</details>
			</figcaption>
		</figure>
	);
}

export { Diagram };
